# ZeroLag

ZeroLag is a high-performance cryptocurrency scanner and trading dashboard for Binance Futures. It provides real-time, low-latency visualization of market data across multiple symbols and timeframes.

The application uses a custom engine to handle high-frequency WebSocket updates and renders charts at 60fps using uPlot. It allows traders to rank the market by various metrics including volume, range, and growth.

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm

### Running the Application

1. Navigate to the frontend directory:

   ```bash
   cd frontend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

The application will be available at <http://localhost:5173>.

### Building for Production

To create a production build:

```bash
cd frontend
npm run build
```

The build artifacts will be located in the frontend/dist directory.
