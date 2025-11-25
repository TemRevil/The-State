# The State

A React + TypeScript application for document management and user authentication.

## Features

- User authentication with Firebase
- PDF document viewer and management
- Admin dashboard for user management
- Screenshot/screen capture protection
- Responsive UI with modern components

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:5173](http://localhost:5173) in your browser

### Build for Production

```bash
npm run build
```

The optimized build will be created in the `dist/` directory.

### Deployment

The project is configured to deploy to GitHub Pages automatically on push to `main` branch.

To manually deploy:
```bash
npm run deploy
```

## Project Structure

- `components/` - React components (LoginPage, DashboardPage, AdminDashboard, PDFViewer)
- `firebaseConfig.ts` - Firebase initialization and configuration
- `styles.css` - Global styles
- `App.tsx` - Main application component

## Technologies

- React 18
- TypeScript
- Vite
- Firebase (Auth, Firestore, Storage)
- PDF.js for document viewing
- Lucide React for icons
