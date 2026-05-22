import { Nunito } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Toaster } from "@/components/ui/sonner";

const nunito = Nunito({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

export const metadata = {
  title: "HR Document Automation",
  description: "Generate HR Documents automatically to Google Docs",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${nunito.className} antialiased bg-[#e2e8f0]`}>
        <Providers>
          {children}
          <Toaster position="top-right" richColors />
        </Providers>
      </body>
    </html>
  );
}
