import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase:new URL("https://nexus-ai-trading-bot.xoxi-me.chatgpt.site"),
  title:{default:"Nexus Trader — Browser-Native Futures Control",template:"%s | Nexus Trader"},
  description:"A Chrome and Edge platform for Binance Futures strategy controls, automated USDT BEP20 payment verification and one-device licensing.",
  keywords:["Binance Futures bot","Chrome trading extension","BEP20 licence","trading bot dashboard","Nexus Trader"],
  verification:{other:{"fameswap-verification":"agu3xoSVO2KAFxicN1MNLA3u4ytCjd3Q"}},
  alternates:{canonical:"/"},robots:{index:true,follow:true},
  openGraph:{type:"website",url:"/",siteName:"Nexus Trader",title:"Nexus Trader — Browser-Native Futures Control",description:"Strategy controls, automated payment verification and device-bound licensing in one browser extension."},
  twitter:{card:"summary",title:"Nexus Trader",description:"Browser-native futures control with automated licensing."},
  icons:{icon:"/logo.png",shortcut:"/logo.png"}
};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>}
