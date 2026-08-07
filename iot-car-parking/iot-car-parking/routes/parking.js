const express = require('express');
const { User, Car, ParkingSlot, ParkingSession, Booking } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Helper: broadcast event to WebSocket clients
function broadcast(req, event) {
  const fn = req.app.get('broadcastEvent');
  if (fn) fn(event);
}

// Helper: Find nearest empty slot (skips booked slots)
async function findNearestEmptySlot(skipBooked = true) {
  const query = skipBooked ? { status: 'empty' } : { status: { $in: ['empty', 'booked'] } };
  const slot = await ParkingSlot.findOne(query).sort({ slot_number: 1 });
  return slot ? slot.slot_number : null;
}

// Helper: Calculate parking fee (flat rate)
function calculateFee() {
  return 5; // £5 flat for direct park
}

// ===== HARDWARE SIMULATION ENDPOINTS =====

// Car arrives at entry gate (no auth required - called by simulation)
router.post('/entry', async (req, res) => {
  try {
    const { car_registration, car_model, owner_name, user_id, slot_number } = req.body;

    if (!car_registration) {
      return res.status(400).json({ error: 'Car registration is required' });
    }

    // Check if car already parked
    const activeSession = await ParkingSession.findOne({
      car_registration,
      status: 'active',
    });

    if (activeSession) {
      return res.status(409).json({ error: 'Car is already parked in slot ' + activeSession.slot_number });
    }

    // Find empty slot (use specific slot if provided, otherwise nearest available)
    let slotNumber;
    if (slot_number) {
      // Verify the slot is available (empty or booked — booked slots are reserved for this car)
      const targetSlot = await ParkingSlot.findOne({ slot_number });
      if (!targetSlot) {
        return res.status(404).json({ error: `Slot #${slot_number} not found` });
      }
      if (targetSlot.status === 'occupied') {
        return res.status(409).json({ error: `Slot #${slot_number} is already occupied` });
      }
      slotNumber = slot_number;
    } else {
      slotNumber = await findNearestEmptySlot();
      if (!slotNumber) {
        return res.status(400).json({ error: 'Parking is full! No empty slots available.' });
      }
    }

    // Identify user
    let finalUserId = null;
    let owner = owner_name || 'Guest';

    // Try to find by provided user_id first
    if (user_id) {
      finalUserId = user_id;
    }

    // Look up car in database
    const existingCar = await Car.findOne({ registration_number: car_registration.toUpperCase() });
    let carId = null;

    if (existingCar) {
      carId = existingCar._id;
      finalUserId = existingCar.user_id;
      const user = await User.findById(existingCar.user_id);
      if (user) owner = user.name;
    }

    // Fallback to demo user
    if (!finalUserId) {
      const demoUser = await User.findOne({ email: 'demo@parking.com' });
      finalUserId = demoUser._id;
    }

    // Create car entry if not in DB
    if (!carId) {
      const newCar = await Car.create({
        user_id: finalUserId,
        model: car_model || 'Unknown',
        registration_number: car_registration.toUpperCase(),
      });
      carId = newCar._id;
    }

    // Create parking session
    const session = await ParkingSession.create({
      car_id: carId,
      user_id: finalUserId,
      car_registration: car_registration.toUpperCase(),
      car_model: car_model || 'Unknown',
      owner_name: owner,
      slot_number: slotNumber,
      status: 'active',
    });

    // Mark slot as occupied
    await ParkingSlot.updateOne(
      { slot_number: slotNumber },
      { status: 'occupied', current_session_id: session._id }
    );

    // Get updated counts
    const filled = await ParkingSlot.countDocuments({ status: 'occupied' });
    const empty = await ParkingSlot.countDocuments({ status: 'empty' });

    const response = {
      success: true,
      session_id: session._id,
      slot_number: slotNumber,
      car_registration: car_registration.toUpperCase(),
      car_model: car_model || 'Unknown',
      owner_name: owner,
      entry_time: new Date().toISOString(),
      slots_filled: filled,
      slots_empty: empty,
      message: `🚗 Welcome ${owner}! Your slot is #${slotNumber}`,
    };

    // Broadcast to all WebSocket clients
    broadcast(req, { type: 'entry', entry: response });

    // Mark any booking as completed
    await Booking.updateOne(
      { slot_number: slotNumber, status: { $in: ['confirmed', 'arriving'] } },
      { status: 'completed' }
    );

    // Slot count broadcast
    const filled2 = await ParkingSlot.countDocuments({ status: 'occupied' });
    const empty2 = await ParkingSlot.countDocuments({ status: 'empty' });
    const booked2 = await ParkingSlot.countDocuments({ status: 'booked' });
    broadcast(req, { type: 'slots-update', filled: filled2, empty: empty2, booked: booked2 });

    res.status(201).json(response);
  } catch (err) {
    console.error('Entry error:', err);
    res.status(500).json({ error: 'Server error at entry' });
  }
});

// Car exits the parking
router.post('/exit', async (req, res) => {
  try {
    const { car_registration, session_id } = req.body;

    let session;

    if (session_id) {
      session = await ParkingSession.findOne({ _id: session_id, status: 'active' });
    } else if (car_registration) {
      session = await ParkingSession.findOne({
        car_registration: car_registration.toUpperCase(),
        status: 'active',
      });
    }

    if (!session) {
      return res.status(404).json({ error: 'No active parking session found for this car' });
    }

    const exitTime = new Date().toISOString();
    let fee = calculateFee();

    // Check if this car was pre-booked (already paid £7 at booking time)
    const preBooking = await Booking.findOne({
      car_registration: session.car_registration.toUpperCase(),
      status: 'completed',
    }).sort({ created_at: -1 }).lean();
    const isPreBook = !!preBooking;
    if (isPreBook) fee = 0; // Already paid via pre-book

    // Check wallet balance
    const user = await User.findById(session.user_id);
    let paymentStatus = 'completed';
    let paymentMessage = isPreBook
      ? `£7 already paid via pre-booking`
      : `£${fee} charged from wallet`;

    if (isPreBook) {
      // Already paid — no wallet deduction
    } else if (user.wallet_balance >= fee) {
      await User.findByIdAndUpdate(session.user_id, { $inc: { wallet_balance: -fee } });
    } else {
      paymentMessage = `£${fee} charged (wallet had £${user.wallet_balance}, simulated external payment for remaining)`;
    }

// Update session
    await ParkingSession.findByIdAndUpdate(session._id, {
      exit_time: exitTime,
      amount_charged: fee,
      status: 'completed',
    });

    // Free the slot
    await ParkingSlot.updateOne(
      { slot_number: session.slot_number },
      { status: 'empty', current_session_id: null }
    );

    // Mark any related booking as completed
    await Booking.updateOne(
      { slot_number: session.slot_number, status: { $in: ['confirmed', 'arriving'] } },
      { status: 'completed' }
    );

    // Get updated counts
    const filled = await ParkingSlot.countDocuments({ status: 'occupied' });
    const empty = await ParkingSlot.countDocuments({ status: 'empty' });

    const response = {
      success: true,
      session_id: session._id,
      car_registration: session.car_registration,
      car_model: session.car_model,
      owner_name: session.owner_name,
      slot_number: session.slot_number,
      entry_time: session.entry_time,
      exit_time: exitTime,
      duration_hours: Math.max(1, Math.ceil((new Date(exitTime) - new Date(session.entry_time)) / (1000 * 60 * 60))),
      amount_charged: fee,
      payment_status: paymentStatus,
      payment_message: paymentMessage,
      remaining_balance: Math.max(0, user.wallet_balance - fee),
      slots_filled: filled,
      slots_empty: empty,
      message: isPreBook
        ? `🧾 ${session.car_registration} - Pre-booked (paid £7). Thank you!`
        : `🧾 ${session.car_registration} - Paid £${fee}. Thank you!`,
    };

    // Broadcast to all WebSocket clients
    broadcast(req, { type: 'exit', exit: response });

    // New slot counts broadcast
    const filled2 = await ParkingSlot.countDocuments({ status: 'occupied' });
    const empty2 = await ParkingSlot.countDocuments({ status: 'empty' });
    const booked2 = await ParkingSlot.countDocuments({ status: 'booked' });
    broadcast(req, { type: 'slots-update', filled: filled2, empty: empty2, booked: booked2 });

    res.json(response);
  } catch (err) {
    console.error('Exit error:', err);
    res.status(500).json({ error: 'Server error at exit' });
  }
});

// ===== STATUS ENDPOINTS =====

// Get all slot statuses
router.get('/slots', async (req, res) => {
  const slots = await ParkingSlot.find().sort({ slot_number: 1 }).lean();

  // Get active bookings for booked slots
  const activeBookings = await Booking.find({
    status: { $in: ['confirmed', 'arriving'] }
  }).lean();
  const bookingMap = {};
  for (const b of activeBookings) {
    bookingMap[b.slot_number] = b;
  }

  const result = [];
  for (const slot of slots) {
    let car = null;
    if (slot.status === 'occupied' && slot.current_session_id) {
      const session = await ParkingSession.findById(slot.current_session_id)
        .select('car_registration car_model owner_name entry_time')
        .lean();
      car = session;
    }
    const booking = bookingMap[slot.slot_number] || null;
    result.push({ ...slot, car, booking });
  }

  const filled = slots.filter(s => s.status === 'occupied').length;
  const empty = slots.filter(s => s.status === 'empty').length;
  const booked = slots.filter(s => s.status === 'booked').length;

  res.json({
    total_slots: 12,
    filled,
    empty,
    booked,
    slots: result,
  });
});

// Get slot by number
router.get('/slots/:number', async (req, res) => {
  const slot = await ParkingSlot.findOne({ slot_number: parseInt(req.params.number) }).lean();
  if (!slot) return res.status(404).json({ error: 'Slot not found' });

  let car = null;
  if (slot.current_session_id) {
    car = await ParkingSession.findById(slot.current_session_id).lean();
  }
  res.json({ ...slot, car });
});

// Get active session by car registration
router.get('/active/:registration', async (req, res) => {
  const session = await ParkingSession.findOne({
    car_registration: req.params.registration.toUpperCase(),
    status: 'active',
  });
  if (!session) return res.status(404).json({ error: 'No active session found' });
  res.json(session);
});

module.exports = router;
