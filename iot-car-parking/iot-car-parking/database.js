const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ============================================================
// MongoDB Connection
// ============================================================
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/iot-parking';

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// ============================================================
// Schemas
// ============================================================

const userSchema = new mongoose.Schema({
  name:          { type: String, required: true },
  email:         { type: String, required: true, unique: true, lowercase: true },
  phone:         { type: String, default: '' },
  password:      { type: String, required: true },
  address:       { type: String, default: '' },
  wallet_balance:{ type: Number, default: 100.00 },
  created_at:    { type: Date, default: Date.now },
});

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

const carSchema = new mongoose.Schema({
  user_id:              { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  model:                { type: String, required: true },
  registration_number:  { type: String, required: true, unique: true, uppercase: true },
  color:                { type: String, default: '' },
});

const paymentMethodSchema = new mongoose.Schema({
  user_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:       { type: String, required: true },  // credit_card, debit_card, upi, netbanking
  details:    { type: String, required: true },
  is_default: { type: Boolean, default: false },
});

const parkingSlotSchema = new mongoose.Schema({
  slot_number:        { type: Number, required: true, unique: true },
  status:             { type: String, enum: ['empty', 'occupied', 'booked'], default: 'empty' },
  current_session_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ParkingSession', default: null },
});

const parkingSessionSchema = new mongoose.Schema({
  car_id:            { type: mongoose.Schema.Types.ObjectId, ref: 'Car' },
  user_id:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  car_registration:  { type: String, required: true },
  car_model:         { type: String, default: 'Unknown' },
  owner_name:        { type: String, default: 'Guest' },
  entry_time:        { type: Date, default: Date.now },
  exit_time:         { type: Date, default: null },
  slot_number:       { type: Number, required: true },
  status:            { type: String, enum: ['active', 'completed'], default: 'active' },
  amount_charged:    { type: Number, default: 0.00 },
});

const bookingSchema = new mongoose.Schema({
  user_id:               { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  slot_number:           { type: Number, required: true },
  car_registration:      { type: String, required: true },
  car_model:             { type: String, default: 'Unknown' },
  owner_name:            { type: String, default: 'Guest' },
  arrival_delay_seconds: { type: Number, default: 10 },
  amount_paid:           { type: Number, default: 7 },
  payment_status:        { type: String, enum: ['pending', 'paid', 'refunded'], default: 'paid' },
  status:               { type: String, enum: ['confirmed', 'arriving', 'completed', 'cancelled'], default: 'confirmed' },
  booking_reference:    { type: String, unique: true },
  created_at:           { type: Date, default: Date.now },
});

// ============================================================
// Models
// ============================================================
const User            = mongoose.model('User', userSchema);
const Car             = mongoose.model('Car', carSchema);
const PaymentMethod   = mongoose.model('PaymentMethod', paymentMethodSchema);
const ParkingSlot     = mongoose.model('ParkingSlot', parkingSlotSchema);
const ParkingSession  = mongoose.model('ParkingSession', parkingSessionSchema);
const Booking         = mongoose.model('Booking', bookingSchema);

// ============================================================
// Initialize Data (run once on startup)
// ============================================================
async function initializeData() {
  try {
    // 1. Create 12 parking slots if they don't exist
    const slotCount = await ParkingSlot.countDocuments();
    if (slotCount === 0) {
      const slots = [];
      for (let i = 1; i <= 12; i++) {
        slots.push({ slot_number: i, status: 'empty' });
      }
      await ParkingSlot.insertMany(slots);
      console.log('✅ Initialized 12 parking slots');
    }

    // 2. Create demo user if not exists
    const demoUser = await User.findOne({ email: 'demo@parking.com' });
    if (!demoUser) {
      const hashedPw = bcrypt.hashSync('demo123', 10);
      await User.create({
        name: 'Demo User',
        email: 'demo@parking.com',
        phone: '9876543210',
        password: hashedPw,
        address: '123 Main Street, City',
        wallet_balance: 100.00,
      });
      console.log('✅ Created demo user: demo@parking.com / demo123');
    }
  } catch (err) {
    console.error('Initialization error:', err);
  }
}

initializeData();

module.exports = {
  User,
  Car,
  PaymentMethod,
  ParkingSlot,
  ParkingSession,
  Booking,
  mongoose,
};
