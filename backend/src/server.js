
import express from 'express'
import cors from 'cors'
import { pathToFileURL } from 'node:url'
import { supabase } from './db.js'
import { getCached } from './cache.js'
import { usableBuildings, validBuildings, validCounts } from './validate.js'
import {toMeeting, toBuilding, toDayNumber, toBusyKey} from './transform.js'
const app = express()
// Hosts (Render, Railway, Fly) assign a port and route to it. A hardcoded one
// binds somewhere nothing is listening, and the deploy "succeeds" but 502s.
const port = process.env.PORT || 3001

const BUILDINGS_TTL_MS = 10 * 60 * 1000   // 10 minutes
const AVAILABILITY_TTL_MS = 60 * 1000     // 1 minute

// Not access control (curl ignores CORS) -- it stops other sites running their
// frontend on our quota. Trim: " b" matches no Origin and fails CLOSED.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))   // no trailing slash; Origin never has one
  .filter(Boolean)
console.log('CORS allowed origins:', allowedOrigins)
app.use(cors({origin: allowedOrigins}))

// The uncached query. Throws instead of returning { data, error } so that
// getCached() can tell success from failure and skip storing failures.
async function loadBuildings() {
  console.log('CACHE MISS: querying buildings from Supabase')
  const { data, error } = await supabase
    .from('buildings')                            // FROM buildings
    // rooms(room_number) nests via the FK, so this stays one row per building
    // and the 1,000-row PostgREST cap is not in play.
    .select('id, code, name, lat:latitude, lng:longitude, rooms(room_number)')
    .order('code')                                 // ORDER BY code

  if (error) throw new Error(`buildings query failed: ${error.message}`)

  // Drop rows that cannot be presented, and say which. Cache-miss only, so
  // this logs once every 10 minutes rather than once per request.
  const {kept, skipped} = usableBuildings(data.map(toBuilding))
  for (const {code, reason} of skipped) {
    console.warn(`buildings: skipping ${code} -- ${reason}`)
  }
  return kept
}

// Defined once because there are two callers (the route, and the availability
// loader) -- spelling getCached out twice is how one of them loses the validator.
function loadBuildingsCached() {
  return getCached('buildings', BUILDINGS_TTL_MS, loadBuildings, validBuildings)
}

app.get('/api/buildings', async (req, res) => {
  try {
    const buildings = await loadBuildingsCached()
    return res.json(buildings)
  } catch (err) {
    console.error(err.message)
    return res.status(500).json({ error: 'Failed to load buildings' })
  }
})

app.get('/api/schedule', async(req, res)=>{
  const {building, year, quarter} = req.query
  if(!building || !year || !quarter){
    return res.status(400).json({error: 'building, year and quarter are required'})
  }
  const {data,error} = await supabase
  .from('class_meetings')
  .select(`
    course_title, 
    day_of_week, 
    start_time,
    end_time,
    rooms!inner(room_number, buildings!inner(code))
    `)
  .eq('term',`${quarter} ${year}`)
  .eq('rooms.buildings.code', building.toUpperCase())
  if (error){
      console.error(`Error when fetching meetings data`)
      return res.status(500).json({ error: 'Failed to load buildings' })
  }
  return res.json(data.map(toMeeting))
});


// HH:MM or HH:MM:SS, 00-23 hours. Postgres will cast the string to `time` when
// it compares, so a malformed value would error inside the query instead of here.
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/

app.get('/api/availability', async (req, res) => {
  const {year, quarter, day, time} = req.query
  if (!year || !quarter || !day || !time) {
    return res.status(400).json({error: 'year, quarter, day and time are required'})
  }
  const dayNumber = toDayNumber(day)
  if (dayNumber === undefined || dayNumber < 1 || dayNumber > 5) {
    return res.status(400).json({error: 'day must be one of M, Tu, W, Th, F'})
  }
  if (!TIME_PATTERN.test(time)) {
    return res.status(400).json({error: 'time must be HH:MM'})
  }

  try {
    // Every input is in the key. Leaving `time` out would serve the previous
    // time's counts while the user drags the slider -- a wrong number, not an error.
    const key = `availability:${quarter}-${year}-${day}-${time}`
    const counts = await getCached(key, AVAILABILITY_TTL_MS, async () => {
      // 1. The room universe: the same cached value /api/buildings serves. No query.
      const buildings = await loadBuildingsCached()

      // 2. Busy right now. A 13:00-13:50 class holds the room at 13:00 and has
      //    released it at 13:50, hence lte on start but strict gt on end.
      const {data, error} = await supabase
        .from('class_meetings')
        .select('rooms!inner(room_number, buildings!inner(code))')
        .eq('term', `${quarter} ${year}`)
        .eq('day_of_week', dayNumber)
        .lte('start_time', time)
        .gt('end_time', time)

      if (error) throw new Error(`availability query failed: ${error.message}`)
      // Truncated busy rows count in-class rooms as open. A plausible wrong
      // number on screen is worse than a 500, so this throws rather than warns.
      if (data.length >= 1000) {
        throw new Error('availability: hit the PostgREST 1000-row cap; counts would be too high')
      }

      const busy = new Set(data.map(toBusyKey))

      // Includes buildings with zero open rooms -- the sidebar shows "None"
      // at zero, and dropping them would make buildings vanish from the list.
      return buildings.map(building => ({
        code: building.code,
        open: building.rooms.filter(room => !busy.has(`${building.code}:${room}`)).length,
      }))
    }, validCounts)

    return res.json(counts)
  } catch (err) {
    console.error(err.message)
    return res.status(500).json({error: 'Failed to load availability'})
  }
})


app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
});

// Start the server only when run directly -- not when imported by the test
// suite, which exercises the app object without binding a port.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(port, () => {
    // Not necessarily localhost: on a host, `port` comes from process.env.PORT
    // (Render uses 10000) and sits behind their proxy, which serves 443 publicly.
    console.log(`API listening on port ${port}`)
  })
}

export { app }
