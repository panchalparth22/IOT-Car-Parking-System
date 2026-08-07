const express = require('express');
const { Booking, ParkingSlot, ParkingSession, User, Car } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Helper: broadcast event to WebSocket clients
function broadcast(req, event) {
  const fn = req.app.get('broadcastEvent');
  if (fn) fn(event);
}

// Generate a short booking reference
function genRef() {
  return 'BK-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 5).toUpperCase();
}

// ===== BOOKING ENDPOINTS =====

// Create a booking (auth optional — if token present, link to user)
router.post('/', async (req, res) => {
  try {
    const { slot_number, car_registration, car_model, owner_name, arrival_delay_seconds } = req.body;

    if (!slot_number || !car_registration) {
      return res.status(400).json({ error: 'slot_number and car_registration are required' });
    }

    if (slot_number < 1 || slot_number > 12) {
      return res.status(400).json({ error: 'Invalid slot number (1-12)' });
    }

    // Check slot availability
    const slot = await ParkingSlot.findOne({ slot_number });
    if (!slot) {
      return res.status(404).json({ error: 'Slot not found' });
    }
    if (slot.status !== 'empty') {
      return res.status(409).json({ error: `Slot #${slot_number} is currently ${slot.status}` });
    }

    const ref = genRef();
    const delay = arrival_delay_seconds || 10;

    // Try to extract user_id from auth token (optional)
    let userId = null;
    const authHeader = req.headers['authorization'];
    if (authHeader) {
      try {
        const token = authHeader.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'parking-secret-key-2024');
        userId = decoded.userId || decoded.id;
      } catch (_) { /* token invalid, proceed without user */ }
    }

    const booking = await Booking.create({
      user_id: userId,
      slot_number,
      car_registration: car_registration.toUpperCase(),
      car_model: car_model || 'Unknown',
      owner_name: owner_name || 'Guest',
      arrival_delay_seconds: delay,
      amount_paid: 7,
      payment_status: 'paid',
      status: 'confirmed',
      booking_reference: ref,
    });

    // Mark slot as booked
    await ParkingSlot.updateOne({ slot_number }, { status: 'booked' });

    // Broadcast booking event
    broadcast(req, {
      type: 'booking',
      booking: { booking_reference: ref, slot_number, status: 'confirmed' }
    });

    res.status(201).json({
      success: true,
      booking_reference: ref,
      slot_number,
      car_registration: car_registration.toUpperCase(),
      arrival_delay_seconds: delay,
      amount_paid: 7,
      message: `✅ Slot #${slot_number} booked! £7 paid. Car arrives in ${delay}s`,
    });
  } catch (err) {
    console.error('Booking error:', err);
    res.status(500).json({ error: 'Server error creating booking' });
  }
});

// List active (confirmed) bookings (public)
router.get('/', async (req, res) => {
  try {
    const bookings = await Booking.find({
      status: { $in: ['confirmed', 'arriving'] }
    }).sort({ created_at: -1 }).lean();
    res.json({ bookings });
  } catch (err) {
    console.error('List bookings error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get my bookings — user-specific (requires auth)
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const bookings = await Booking.find({ user_id: req.user.id || req.user.userId })
      .sort({ created_at: -1 }).lean();
    res.json({ bookings });
  } catch (err) {
    console.error('My bookings error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// List all bookings (admin / monitoring)
router.get('/all', async (req, res) => {
  try {
    const bookings = await Booking.find().sort({ created_at: -1 }).lean();
    res.json({ bookings });
  } catch (err) {
    console.error('List all bookings error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Cancel a booking
router.delete('/:ref', async (req, res) => {
  try {
    const booking = await Booking.findOne({ booking_reference: req.params.ref });
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Free the slot if it was booked by this booking
    await ParkingSlot.updateOne(
      { slot_number: booking.slot_number, status: 'booked' },
      { status: 'empty' }
    );

    booking.status = 'cancelled';
    booking.payment_status = 'refunded';
    await booking.save();

    broadcast(req, {
      type: 'booking-cancel',
      booking: { booking_reference: booking.booking_reference, slot_number: booking.slot_number }
    });

    res.json({ success: true, message: `Booking ${req.params.ref} cancelled — refunded £${booking.amount_paid}` });
  } catch (err) {
    console.error('Cancel booking error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark a booking as arrived (triggered by simulation after delay)
router.post('/:ref/arrive', async (req, res) => {
  try {
    const booking = await Booking.findOne({ booking_reference: req.params.ref, status: 'confirmed' });
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found or already processed' });
    }

    booking.status = 'arriving';
    await booking.save();

    broadcast(req, {
      type: 'booking-arriving',
      booking: {
        booking_reference: booking.booking_reference,
        slot_number: booking.slot_number,
        car_registration: booking.car_registration,
      }
    });

    res.json({
      success: true,
      message: `Booking ${req.params.ref} is arriving`,
      slot_number: booking.slot_number,
      car_registration: booking.car_registration,
      car_model: booking.car_model,
      owner_name: booking.owner_name,
    });
  } catch (err) {
    console.error('Arrive booking error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
