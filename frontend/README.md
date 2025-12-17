# ZeroLag - High-Performance Crypto Scanner

![ZeroLag Banner](https://via.placeholder.com/1200x400/0b0e11/00f0ff?text=ZeroLag+Crypto+Scanner)

**ZeroLag** is a professional-grade, real-time cryptocurrency scanner designed for high-frequency traders. It provides an instantaneous, lag-free visualization of the Binance Futures market, allowing traders to spot volatility, volume spikes, and price action anomalies across the entire market in milliseconds.

Unlike traditional screeners that refresh every few seconds, ZeroLag maintains live WebSocket connections to hundreds of tickers simultaneously, rendering them at 60fps using a custom-built optimization engine.

## 🚀 Key Features

### ⚡ Real-Time "Zero Lag" Engine

- **Direct WebSocket Stream**: Connects directly to Binance Futures WebSocket API for sub-millisecond data updates.
- **60FPS Rendering**: Powered by `uPlot` and a custom React scheduling engine to handle high-frequency updates without UI freezing.
- **Smart Throttling**: Intelligent data batching ensures the UI stays responsive even during extreme market volatility.

### 📊 Multi-Dimensional Analysis

- **Dynamic Sorting**: Instantly rank the market by:
  - **Volume**: 24h Volume, 15m Volume, and "Growth" (Volume Acceleration).
  - **Volatility**: Price Range % (5m, 15m, 1h, 4h).
  - **Extremums**: "Dext" mode highlights symbols trading closest to their daily Highs or Lows.
- **Multi-Timeframe**: Seamlessly switch between `1m`, `5m`, `15m`, `1h`, `4h`, and `1d` intervals.

### 🖥️ Adaptive Grid Interface

- **Flexible Layouts**: Switch between 2x2 (Focus), 3x3, 4x4 (Standard), and 5x5 (Overview) grids instantly.
- **Responsive Design**: Fully optimized for multi-monitor setups, tablets, and high-DPI displays.
- **Interactive Charts**:
  - Hover for precise OHLCV data.
  - **Ruler Tool**: Shift+Click to measure price and time deltas.
  - **Live Price Tags**: Color-coded real-time price badges.

---

## 🛠️ Technology Stack

- **Core**: [React 18](https://reactjs.org/) + [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand) (for high-performance transient state)
- **Charting**: [uPlot](https://github.com/leeoniya/uPlot) (Micro-charting library optimized for speed)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Data Source**: Binance Futures API (Public)

---

## 🏁 Getting Started

### Prerequisites

- Node.js v18+
- npm or yarn

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/zerolag.git
   cd zerolag/frontend
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Start the development server**

   ```bash
   npm run dev
   ```

   The app will launch at `http://localhost:5173`.

### Building for Production

To create a production-ready build:

```bash
npm run build
```

The output will be in the `dist` directory.

---

## 🧩 Architecture Overview

ZeroLag uses a unique **"Client Engine"** architecture to bypass the performance limitations of standard React apps handling massive data streams.

1. **ClientEngine**: A singleton class that manages WebSocket connections and raw data buffering outside of the React render cycle.
2. **CandleCache**: An optimized in-memory store for OHLCV data, preventing unnecessary re-renders and garbage collection overhead.
3. **Zustand Store**: Acts as the bridge between the high-frequency Engine and the React UI, syncing only what is necessary for the current view.
4. **Virtualization**: Charts are only rendered when visible (or about to be), ensuring memory efficiency.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
