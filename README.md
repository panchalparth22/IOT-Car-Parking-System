# 🚗 IoT Car Parking System

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.18-000000?logo=express&logoColor=white)](https://expressjs.com)
[![MongoDB](https://img.shields.io/badge/MongoDB-9.7-47A248?logo=mongodb&logoColor=white)](https://mongodb.com)
[![Three.js](https://img.shields.io/badge/Three.js-r160-000000?logo=three.js&logoColor=white)](https://threejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![WebSocket](https://img.shields.io/badge/WebSocket-Live-ff69b4)](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
[![Python](https://img.shields.io/badge/Circuit_Visualizer-Python_3-3776AB?logo=python&logoColor=white)](https://python.org)
[![JWT](https://img.shields.io/badge/Authentication-JWT-000000?logo=jsonwebtokens&logoColor=white)](https://jwt.io)

> **A university project that simulates a complete IoT-based car parking management system** — featuring a **3D interactive simulation**, a **web booking portal**, and a **realistic Python hardware circuit visualizer** — all connected to a live backend with MongoDB persistence.

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [Configuration](#-configuration)
- [API Reference](#-api-reference)
- [Screenshots / Demo](#-screenshots--demo)
- [Project Structure](#-project-structure)
- [Contributing](#-contributing)

---

## 🧭 Overview

The **IoT Car Parking System** is a full-stack web application that simulates an intelligent parking management system. It brings together:

- **A Node.js/Express backend** with MongoDB for persistent data storage
- **A 3D interactive parking lot** built with Three.js and React — click on slots, watch cars drive in and out with animated gates
- **A booking portal** for users to register, manage cars, pre-book slots, and view parking history
- **An automated billing engine** with wallet balance management
- **A realistic Python hardware circuit visualizer** showing a complete ESP32-based IoT diagram with live data sync
- **Real-time updates** via WebSocket across all connected clients
- **Simulated IoT hardware** — IR sensors, servo-controlled gates, LED indicators, and an I2C LCD display

This project was developed as a university submission to demonstrate the integration of IoT concepts, web development, 3D visualization, and hardware simulation in a single cohesive system.

---

## ✨ Features

### 🅿️ Smart Parking Management
- **12 automated parking slots** with real-time occupancy tracking
- **Nearest-available-slot algorithm** — automatically assigns the closest free spot
- **Three slot states**: `empty` 🟢, `booked` 🟠, `occupied` 🔴 — represented visually everywhere
- **Flat-rate billing**: £5 direct park / £7 pre-book (pre-book includes the parking fee)

### 🚗 3D Interactive Simulation
- **Full 3D parking lot** built with Three.js — orbit, pan, and zoom around the scene
- **Animated car entry & exit** — cars drive along the road, gates open, sensors scan
- **Real-time slot indicators**: LEDs glow green/orange/red based on slot status
- **LCD info display** showing free slots, server status, and revenue
- **HUD overlay** with live counts, server status indicator, and revenue tracking

### 📅 Booking Portal
- **User registration & login** with JWT-based authentication
- **Pre-book slots** with configurable arrival delay (5s–60s)
- **Auto-park service** — cars automatically arrive when the booking timer expires
- **Multi-car management** — register and manage multiple vehicles
- **Full parking history** with bookings, sessions, and payment records
- **Wallet system** with balance top-up and automatic fee deduction

### 🔌 Simulated IoT Hardware
- **ESP32 DevKit V4** microcontroller (realistic PCB rendering)
- **12 status LEDs** (one per slot) with 220Ω resistors
- **2x SG90 servo motors** controlling entry and exit gates
- **IR sensors** at entry and exit points for car detection
- **I2C LCD 16×2 display** showing live parking status
- **HC-SR04 ultrasonic sensor** for distance measurement
- **Potentiometer** for slot browsing
- **Buzzer** for audible alerts
- **Wire duct** routing with color-coded GPIO wiring
- **All interactive** — click the IR sensors to simulate car entry/exit

### ⚡ Real-Time Communication
- **WebSocket** connections for instant updates across all clients
- **Automatic sync** between 3D simulation, booking portal, and circuit visualizer
- **Server-side auto-park service** checks every 3 seconds for due bookings

### 👤 User Management
- User signup and login with bcrypt password hashing
- JWT token-based session management (24h expiry)
- Profile editing, wallet management, payment methods
- Per-user parking history and spending analytics

---

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Client Applications                    │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────┐│
│  │  3D Simulation   │  │  Booking Portal  │  │  Circuit ││
│  │  (Three.js +     │  │  (Vanilla JS)    │  │Visualizer││
│  │   React)         │  │                  │  │ (Python) ││
│  └────────┬─────────┘  └────────┬─────────┘  └────┬─────┘│
└───────────┼──────────────────────┼──────────────────┼──────┘
            │  REST + WebSocket   │  REST + WS      │  REST
            ▼                      ▼                  ▼
┌───────────────────────────────────────────────────────────┐
│                   Express.js Backend                       │
│  ┌─────────┐  ┌───────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Auth    │  │  Parking  │  │  Bookings│  │  Users   │  │
│  │  Routes  │  │  Routes   │  │  Routes  │  │  Routes  │  │
│  └────┬────┘  └─────┬─────┘  └────┬─────┘  └─────┬────┘  │
│       └──────────────┴─────────────┴───────────────┘       │
│                          │                                  │
│              ┌───────────▼────────────┐                    │
│              │    MongoDB (Mongoose)  │                    │
│              └────────────────────────┘                    │
│              ┌────────────────────────┐                    │
│              │  WebSocket (Server)    │                    │
│              │  Auto-Park Service     │                    │
│              └────────────────────────┘                    │
└───────────────────────────────────────────────────────────┘
```

### Data Flow
1. **3D Simulation**: User clicks "Park" → REST API call to `/api/parking/entry` → MongoDB updated → WebSocket broadcast → all clients sync
2. **Pre-Booking**: User books a slot → Booking created → Auto-park timer starts → Timer fires → Automatic car entry simulation
3. **Circuit Visualizer**: Polls REST API every 4s + WebSocket for instant updates → Renders LED states, gate positions, LCD text

---

## 🛠 Tech Stack

### Backend
| Technology | Purpose |
|---|---|
| **Node.js** | JavaScript runtime (v18+) |
| **Express.js** | Web framework and REST API |
| **MongoDB + Mongoose** | Document database & ODM |
| **WebSocket (ws)** | Real-time bidirectional communication |
| **JWT (jsonwebtoken)** | Stateless authentication |
| **bcryptjs** | Password hashing |
| **cors** | Cross-origin resource sharing |

### Frontend — 3D Simulation
| Technology | Purpose |
|---|---|
| **React 18** | UI component framework |
| **Three.js (r160)** | 3D rendering engine |
| **OrbitControls** | Camera manipulation (pan, zoom, orbit) |
| **EffectComposer + BloomPass** | Post-processing (glow effects) |
| **RoomEnvironment** | Realistic environment lighting |

### Frontend — Booking Portal
| Technology | Purpose |
|---|---|
| **Vanilla JavaScript** | Client-side logic |
| **HTML5 + CSS3** | Responsive dark-themed UI |
| **CSS Grid + Flexbox** | Layout management |

### Python Hardware Visualizer
| Technology | Purpose |
|---|---|
| **Python 3 + tkinter** | GUI framework |
| **websocket-client** | Real-time data sync |
| **urllib** | HTTP REST polling |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** v18 or higher
- **MongoDB** — local installation or [MongoDB Atlas](https://www.mongodb.com/atlas) connection string
- **Python 3** (optional, for the circuit visualizer)
  - `pip install websocket-client` (required for the visualizer)

### 1. Clone & Install

```bash
# Navigate to the project
cd iot-car-parking

# Install Node.js dependencies
npm install
```

### 2. Start MongoDB

```bash
# Local (default)
mongod

# Or set an Atlas URI (see Configuration below)
```

### 3. Run the Server

```bash
npm start
```

You'll see:
```
+=================================================+
|   🚗 IoT CAR PARKING SYSTEM v2.0            |
+=================================================+
|  Server:    http://localhost:3000                |
|  3D Sim:   http://localhost:3000/react-parking.html |
|  Portal:   http://localhost:3000/booking-portal.html |
|  Demo:     demo@parking.com / demo123             |
+=================================================+
```

### 4. Open in Browser

| Page | URL |
|---|---|
| **Landing Page** | http://localhost:3000 |
| **3D Simulation** | http://localhost:3000/react-parking.html |
| **Booking Portal** | http://localhost:3000/booking-portal.html |

### 5. (Optional) Launch the Circuit Visualizer

```bash
python circuit_visualizer.py
```

### Demo Credentials

| Field | Value |
|---|---|
| **Email** | `demo@parking.com` |
| **Password** | `demo123` |
| **Wallet Balance** | £100.00 |

---

## ⚙️ Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `MONGO_URI` | `mongodb://localhost:27017/iot-parking` | MongoDB connection string |
| `JWT_SECRET` | `parking-secret-key-2024` (fallback: `iot-car-parking-secret-key-university-project-2024`) | JWT signing secret |

### Default Data (Auto-Initialized)
- **12 parking slots** created on first startup
- **Demo user** created if not exists (`demo@parking.com` / `demo123`)

---

## 📡 API Reference

All API endpoints are prefixed with `/api`.

### Authentication

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/auth/signup` | Register a new user | ❌ |
| `POST` | `/api/auth/login` | Login and receive JWT | ❌ |
| `GET` | `/api/auth/me` | Get current user profile | ✅ |

### Parking

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/parking/entry` | Simulate car arrival & assign slot | ❌ |
| `POST` | `/api/parking/exit` | Process car exit & calculate fee | ❌ |
| `GET` | `/api/parking/slots` | Get status of all 12 slots | ❌ |
| `GET` | `/api/parking/slots/:number` | Get single slot details | ❌ |
| `GET` | `/api/parking/active/:registration` | Get active session by car reg | ❌ |

### Bookings

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/bookings` | Create a booking (£7) | ❌* |
| `GET` | `/api/bookings` | List active (confirmed) bookings | ❌ |
| `GET` | `/api/bookings/my` | Get current user's bookings | ✅ |
| `GET` | `/api/bookings/all` | List all bookings | ❌ |
| `DELETE` | `/api/bookings/:ref` | Cancel a booking (refund) | ❌ |
| `POST` | `/api/bookings/:ref/arrive` | Mark a booking as arriving | ❌ |

*\*Auth token is optional — if provided, the booking is linked to the user account.*

### Users

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/users/profile` | Get user profile | ✅ |
| `PUT` | `/api/users/profile` | Update profile | ✅ |
| `POST` | `/api/users/wallet/add` | Add funds to wallet | ✅ |
| `GET` | `/api/users/wallet` | Get wallet balance | ✅ |
| `GET` | `/api/users/cars` | List user's cars | ✅ |
| `POST` | `/api/users/cars` | Register a car | ✅ |
| `DELETE` | `/api/users/cars/:id` | Remove a car | ✅ |
| `GET` | `/api/users/history` | Get parking history | ✅ |
| `GET` | `/api/users/summary` | Get parking statistics | ✅ |
| `GET` | `/api/users/payment-methods` | List payment methods | ✅ |
| `POST` | `/api/users/payment-methods` | Add payment method | ✅ |
| `DELETE` | `/api/users/payment-methods/:id` | Remove payment method | ✅ |

### WebSocket Events

| Event | Direction | Description |
|---|---|---|
| `entry` | Server → Client | New car entered the parking |
| `exit` | Server → Client | Car exited, fee charged |
| `slots-update` | Server → Client | Slot counts changed |
| `booking` | Server → Client | New booking created |
| `booking-arriving` | Server → Client | Booked car arriving at gate |
| `booking-cancel` | Server → Client | Booking cancelled |
| `connected` | Server → Client | Initial connection handshake |

---

## 🖼 Screenshots / Demo

### Landing Page
The main landing page provides quick access to the 3D simulation and booking portal, along with a feature overview and demo credentials.

### 3D Simulation
An interactive Three.js-rendered parking lot featuring:
- **Night scene** with atmospheric lighting, lamp posts, and buildings
- **12 individually monitored parking slots** with color-coded LED indicators
- **Animated car entry/exit** with smooth path following
- **Entry and exit gates** that open automatically with servo animation
- **Real-time LCD display** showing parking statistics
- **HUD overlay** with free/booked/occupied counts and revenue tracking

### Booking Portal
A dark-themed dashboard with:
- Sign in / Sign up authentication
- Slot booking with car selection and arrival delay configuration
- Car management (add/remove vehicles)
- Complete parking and booking history
- Profile management and wallet balance

### Circuit Visualizer (Python)
An ultra-realistic tkinter-based hardware diagram featuring:
- **ESP32 DevKit V4** PCB with detailed module rendering
- **830-point breadboard** with power rails and component placements
- **12 LEDs** connected through 220Ω resistors to GPIO pins
- **2x SG90 servo motors** for gate control
- **I2C LCD 16×2** display with live updates
- **IR sensors** at entry and exit points
- **Color-coded wiring** through organized wire ducts
- **Interactive** — click IR sensors to simulate cars, potentiometer to browse slots

---

## 📂 Project Structure

```
iot-car-parking/
├── server.js                    # Entry point — Express + WebSocket server
├── database.js                  # MongoDB connection, schemas, seed data
├── package.json                 # Dependencies and scripts
├── middleware/
│   └── auth.js                  # JWT authentication middleware
├── routes/
│   ├── auth.js                  # Signup, login, profile endpoints
│   ├── parking.js               # Entry/exit, slot status endpoints
│   ├── bookings.js              # Pre-booking CRUD endpoints
│   └── users.js                 # User profile, cars, wallet, history
├── public/
│   ├── index.html               # Landing page
│   ├── react-parking.html       # 3D simulation entry point
│   ├── booking-portal.html      # Booking portal dashboard
│   ├── css/
│   │   ├── style.css            # Main site styles
│   │   └── parking-sim.css      # 3D simulation HUD styles
│   └── js/parking/
│       ├── app.js               # React app — 3D simulation UI
│       ├── api.js               # REST API helper functions
│       ├── constants.js         # Shared config (12 slots, models, helpers)
│       └── parking3d.js         # Three.js scene — full 3D parking lot
├── circuit_visualizer.py        # Python tkinter hardware circuit simulator
└── README.md                    # This file
```

### Key File Descriptions

| File | Role |
|---|---|
| `server.js` | Initializes Express, WebSocket, auto-park service, and route mounting |
| `database.js` | Defines all 6 Mongoose schemas (User, Car, PaymentMethod, ParkingSlot, ParkingSession, Booking) and seeds initial data |
| `parking3d.js` | Complete Three.js scene with night lighting, buildings, parking slots, gates, car models, and animation system |
| `app.js` | React UI layer — state management, HUD, side panel, controls, WebSocket sync |
| `circuit_visualizer.py` | 900+ lines of tkinter canvas drawing — realistic ESP32, breadboard, LEDs, servos, I2C LCD, interactive zones |
| `routes/parking.js` | Entry/exit logic, nearest-slot algorithm, fee calculation |
| `routes/bookings.js` | Booking lifecycle: create → confirm → auto-arrive → complete/cancel |
| `routes/users.js` | User data, car registry, payment methods, wallet, history |

### Database Schema (6 Collections)

```
User            — name, email, phone, password (hashed), wallet_balance
Car             — user_id, model, registration_number, color
PaymentMethod   — user_id, type, details, is_default
ParkingSlot     — slot_number (1-12), status (empty|occupied|booked), current_session_id
ParkingSession  — car_id, user_id, slot_number, entry_time, exit_time, amount_charged, status
Booking         — slot_number, car_registration, arrival_delay_seconds, amount_paid, status, booking_reference
```

---

## 🧪 How to Use

### Quick Demo Walkthrough

1. **Start the server** and open http://localhost:3000
2. Click **"Open 3D Simulation"** to enter the interactive parking lot
3. Click the **"Park"** button to simulate a car arriving — watch it drive through the gate
4. Select an occupied slot in the side panel and click **"Remove"** to exit a car
5. Open the **Booking Portal** and sign in with `demo@parking.com` / `demo123`
6. Book a slot — the car will auto-arrive after the configured delay (visible in 3D simulation)
7. Check your booking history and wallet balance in the portal tabs

### Interacting with the Circuit Visualizer

1. Run `python circuit_visualizer.py` while the server is running
2. **Click the "IR-E" sensor** (entry IR) to simulate a car arriving
3. **Click the "IR-X" sensor** (exit IR) to remove the car in the currently selected slot
4. **Click the POT (potentiometer)** to cycle through and inspect slot statuses
5. **Click slot status boxes** at the bottom to select a specific slot
6. **Middle-click drag** to pan the view, **scroll wheel** to zoom, **Ctrl+0** to reset
7. Watch the LEDs change color and the LCD display update in real-time

---

## 🔮 Future Enhancements

- [ ] **QR code generation** for booking tickets
- [ ] **Email/SMS notifications** for booking confirmations and reminders
- [ ] **Admin dashboard** with analytics, revenue charts, and slot usage heatmaps
- [ ] **Real hardware integration** via ESP32 WiFi/MQTT bridge
- [ ] **Mobile responsive** booking portal improvements
- [ ] **Parking fee calculator** with hourly/dynamic pricing
- [ ] **Multi-level parking** support (expand beyond 12 slots)
- [ ] **Export history** to CSV/PDF

---

## 🤝 Contributing

This is a university project, but contributions and suggestions are welcome!

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 🙏 Acknowledgements

- **Three.js** community for the incredible 3D library and examples
- **React** team for the UI framework
- **Mongoose** team for the elegant MongoDB ODM
- **Python tkinter** for enabling the hardware visualizer
- University supervisors and classmates for guidance and feedback

---

<p align="center">
  Built with ❤️ as a university project<br>
  <sub>🚗 IoT Car Parking System v2.0</sub>
</p>
