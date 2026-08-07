const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

// Initialize database immediately
require('./database');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==================================================================
// WebSocket â€” real-time broadcast for all connected clients
// ==================================================================
const wss = new WebSocketServer({ server });

// Store wss on app so routes can broadcast via req.app.get('wss')
app.set('wss', wss);

function broadcastEvent(event) {
  const data = JSON.stringify(event);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(data);
    }
  });
}

app.set('broadcastEvent', broadcastEvent);

wss.on('connection', (ws, req) => {
  console.log('ðŸŸ¢ Client connected via WebSocket');

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      // Forward simulation events to other clients
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === 1) {
          client.send(JSON.stringify(message));
        }
      });
    } catch (err) {
      console.error('WebSocket message error:', err);
    }
  });

  ws.on('close', () => {
    console.log('ðŸ”´ Client disconnected');
  });

  ws.send(JSON.stringify({ type: 'connected', message: 'Server connected' }));
});

// â”€â”€â”€ Server-side auto-park service â”€â”€â”€
const { Booking, ParkingSlot, ParkingSession, Car, User } = require('./database');

async function autoParkService() {
  try {
    const pending = await Booking.find({ status: 'confirmed' });
    if (!pending.length) return;
    const now = Date.now();

    for (const booking of pending) {
      const arrivalMs = new Date(booking.created_at).getTime() + booking.arrival_delay_seconds * 1000;
      if (arrivalMs > now) continue; // not yet due

      console.log(`ðŸ”„ Auto-park: ${booking.booking_reference} â†’ #${booking.slot_number}`);

      // Mark arriving
      booking.status = 'arriving';
      await booking.save();

      // Fetch or create user/car
      let userId = booking.user_id;
      if (!userId) {
        const demo = await User.findOne({ email: 'demo@parking.com' });
        if (demo) userId = demo._id;
      }

      const existingCar = await Car.findOne({ registration_number: booking.car_registration.toUpperCase() });
      let carId = existingCar?._id || null;
      if (!carId) {
        const nc = await Car.create({
          user_id: userId,
          model: booking.car_model || 'Unknown',
          registration_number: booking.car_registration.toUpperCase(),
        });
        carId = nc._id;
      }

      // Create parking session
      const session = await ParkingSession.create({
        car_id: carId,
        user_id: userId,
        car_registration: booking.car_registration.toUpperCase(),
        car_model: booking.car_model || 'Unknown',
        owner_name: booking.owner_name || 'Guest',
        slot_number: booking.slot_number,
        status: 'active',
      });

      // Occupy slot
      await ParkingSlot.updateOne(
        { slot_number: booking.slot_number },
        { status: 'occupied', current_session_id: session._id }
      );

      // Mark booking completed
      booking.status = 'completed';
      await booking.save();

      // Broadcast events
      broadcastEvent({
        type: 'booking-arriving',
        booking: {
          booking_reference: booking.booking_reference,
          slot_number: booking.slot_number,
          car_registration: booking.car_registration,
        }
      });

      const filled = await ParkingSlot.countDocuments({ status: 'occupied' });
      const empty = await ParkingSlot.countDocuments({ status: 'empty' });
      const booked = await ParkingSlot.countDocuments({ status: 'booked' });
      broadcastEvent({ type: 'slots-update', filled, empty, booked });

      console.log(`âœ… Auto-parked ${booking.car_registration} â†’ Slot #${booking.slot_number}`);
    }
  } catch (err) {
    console.error('Auto-park service error:', err);
  }
}

// Run auto-park check every 3 seconds
setInterval(autoParkService, 3000);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/parking', require('./routes/parking'));
app.use('/api/bookings', require('./routes/bookings'));

// SPA fallback â€” serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
+=================================================+
|   \u{1F6D7} IoT CAR PARKING SYSTEM v2.0            |
+=================================================+
|  Server:    http://localhost:${PORT}                |
|  3D Sim:   http://localhost:${PORT}/react-parking.html |
|  Portal:   http://localhost:${PORT}/booking-portal.html |
|  Demo:     demo@parking.com / demo123             |
+=================================================+
  `);
});

