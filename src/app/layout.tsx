import "./globals.css";
import { AuthProvider } from "../context/AuthContext";
import { FinancialYearProvider } from "../context/FinancialYearContext";

export const metadata = {
  title: "ABS Accounts Portal",
  description: "Community portal powered by Next.js and Firebase",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="relative">
        {/* Watermark overlay on top of all content */}
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <img
            src="/abslogo.jpg"
            alt="ABS Logo"
            style={{
              width: '600px',
              height: 'auto',
              opacity: 0.1,
            }}
          />
        </div>
        <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>
          <AuthProvider>
            <FinancialYearProvider>{children}</FinancialYearProvider>
          </AuthProvider>
        </div>
      </body>
    </html>
  );
}
