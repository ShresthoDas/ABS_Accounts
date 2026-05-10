# ABS Accounts Portal

A community portal built with Next.js 14, Firebase, and Tailwind CSS.

## Features

- 🔐 Firebase Authentication
- 📊 User Dashboard with Firestore integration
- 🎨 Styled with Tailwind CSS
- 📱 Responsive design
- 🔒 Protected routes

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- A Firebase project

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd ABS_Accounts
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
   - Copy `.env.example` to `.env.local`
   - Update the values with your Firebase project credentials

```bash
cp .env.example .env.local
```

4. Start the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── globals.css         # Global styles
│   ├── layout.tsx          # Root layout
│   ├── login/              # Login page
│   └── dashboard/          # Dashboard page (protected)
├── components/             # Reusable components
│   └── ProtectedRoute.tsx  # Route protection wrapper
├── context/                # React Context providers
│   └── AuthContext.tsx     # Authentication context
├── firebase/               # Firebase configuration
│   └── config.ts           # Firebase initialization
└── utils/                  # Utility functions
    └── getUserDoc.ts       # Firestore user data fetcher
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint

## Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select an existing one
3. Enable Authentication (Email/Password)
4. Create a Firestore database
5. Copy your Firebase config to `.env.local`

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase API Key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Auth Domain |
| `NEXT_PUBLIC_FIREBASE_DATABASE_URL` | Firebase Database URL |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase Project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase Storage Bucket |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase Messaging Sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase App ID |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Firebase Measurement ID |

## Tech Stack

- [Next.js 14](https://nextjs.org/) - React Framework
- [Firebase](https://firebase.google.com/) - Backend as a Service
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS
- [TypeScript](https://www.typescriptlang.org/) - Type-safe JavaScript

## License

This project is licensed under the MIT License.