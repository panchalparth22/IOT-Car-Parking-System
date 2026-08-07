const express = require('express');
const { User, Car, PaymentMethod, ParkingSession } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// Update profile
router.put('/profile', authenticateToken, async (req, res) => {
  const { name, phone, address } = req.body;
  const user = await User.findByIdAndUpdate(
    req.user.id,
    { name, phone: phone || '', address: address || '' },
    { new: true }
  ).select('-password');
  res.json(user);
});

// Add wallet balance
router.post('/wallet/add', authenticateToken, async (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

  const user = await User.findByIdAndUpdate(
    req.user.id,
    { $inc: { wallet_balance: amount } },
    { new: true }
  ).select('wallet_balance');

  res.json({ wallet_balance: user.wallet_balance, message: `£${amount} added successfully` });
});

// Get wallet balance
router.get('/wallet', authenticateToken, async (req, res) => {
  const user = await User.findById(req.user.id).select('wallet_balance');
  res.json({ wallet_balance: user.wallet_balance });
});

// --- Car Management ---

// Get all cars for user
router.get('/cars', authenticateToken, async (req, res) => {
  const cars = await Car.find({ user_id: req.user.id });
  res.json(cars);
});

// Add a car
router.post('/cars', authenticateToken, async (req, res) => {
  const { model, registration_number, color } = req.body;
  if (!model || !registration_number) {
    return res.status(400).json({ error: 'Model and registration number are required' });
  }

  const existing = await Car.findOne({ registration_number: registration_number.toUpperCase() });
  if (existing) return res.status(409).json({ error: 'Car already registered' });

  const car = await Car.create({
    user_id: req.user.id,
    model,
    registration_number: registration_number.toUpperCase(),
    color: color || '',
  });
  res.status(201).json(car);
});

// Delete a car
router.delete('/cars/:id', authenticateToken, async (req, res) => {
  const car = await Car.findOneAndDelete({ _id: req.params.id, user_id: req.user.id });
  if (!car) return res.status(404).json({ error: 'Car not found' });
  res.json({ message: 'Car removed successfully' });
});

// --- Payment Methods ---

router.get('/payment-methods', authenticateToken, async (req, res) => {
  const methods = await PaymentMethod.find({ user_id: req.user.id });
  res.json(methods);
});

router.post('/payment-methods', authenticateToken, async (req, res) => {
  const { type, details, is_default } = req.body;
  if (!type || !details) return res.status(400).json({ error: 'Type and details are required' });

  const method = await PaymentMethod.create({
    user_id: req.user.id,
    type,
    details,
    is_default: is_default || false,
  });
  res.status(201).json(method);
});

router.delete('/payment-methods/:id', authenticateToken, async (req, res) => {
  const method = await PaymentMethod.findOneAndDelete({ _id: req.params.id, user_id: req.user.id });
  if (!method) return res.status(404).json({ error: 'Payment method not found' });
  res.json({ message: 'Payment method removed' });
});

// --- Parking History ---
router.get('/history', authenticateToken, async (req, res) => {
  const history = await ParkingSession.find({ user_id: req.user.id })
    .populate('car_id', 'model color')
    .sort({ entry_time: -1 });
  res.json(history);
});

// Get parking summary (counts)
router.get('/summary', authenticateToken, async (req, res) => {
  const total = await ParkingSession.countDocuments({ user_id: req.user.id });
  const active = await ParkingSession.countDocuments({ user_id: req.user.id, status: 'active' });

  const completed = await ParkingSession.aggregate([
    { $match: { user_id: req.user.id, status: 'completed' } },
    { $group: { _id: null, total: { $sum: '$amount_charged' } } },
  ]);

  const totalSpent = completed.length > 0 ? completed[0].total : 0;

  res.json({ total_sessions: total, active_sessions: active, total_spent: totalSpent });
});

module.exports = router;
