import Footer from '@/app/Footer';
import TickDisplay from '@/components/client/TickDisplay';
import { TourJoyride } from '@/components/tour/TourJoyride';
import { ModeToggle } from '@/components/modeToggle';
import { AppSidebar } from '@/components/navigation/appSidebar';
import { ThemeProvider } from '@/components/themeProvider';
import ThemeWrapper from '@/components/themeWrapper';
import BackToTopButton from '@/components/ui/BackToTopButton';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { Geist, Geist_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { Toaster } from '../components/ui/sonner';
import { authOptions } from './api/auth/[...nextauth]/authOptions';
import AppProviders from './AppProviders';
import './globals.css';
import KeyStatDisplay from '@/components/client/KeyStatDisplay';

const geistSans = Geist({
    variable: '--font-geist-sans',
    subsets: ['latin'],
    display: 'swap',
});

const geistMono = Geist_Mono({
    variable: '--font-geist-mono',
    subsets: ['latin'],
    display: 'swap',
});

export const metadata: Metadata = {
    title: 'Game',
    description: 'Simulate and manage a company in a dynamic economic environment.',
};

export default async function RootLayout({
    children,
}: Readonly<{
    children: ReactNode;
}>) {
    const session = await getServerSession(authOptions);

    return (
        <html lang='en' suppressHydrationWarning>
            <body className={`${geistSans.variable} ${geistMono.variable}`}>
                <ThemeWrapper>
                    <ThemeProvider attribute='class' defaultTheme='system' enableSystem disableTransitionOnChange>
                        <AppProviders session={session}>
                            <SidebarProvider className='h-dvh overflow-hidden'>
                                <AppSidebar />
                                <SidebarInset className='min-w-0 overflow-hidden'>
                                    <header className='sticky top-0 z-30 flex h-12 sm:h-14 shrink-0 items-center justify-between gap-2 px-2 sm:px-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60'>
                                        <div className='flex items-center gap-2 '>
                                            <SidebarTrigger className='-ml-1' />
                                        </div>
                                        <div className='flex items-center gap-2'>
                                            <KeyStatDisplay />

                                            <TickDisplay />

                                            <ModeToggle />
                                        </div>
                                    </header>
                                    <main className='flex-1 p-2 sm:p-4 overflow-y-auto overflow-x-hidden break-words'>
                                        {children}
                                        <TourJoyride />
                                    </main>
                                    <Footer />
                                </SidebarInset>
                                <BackToTopButton />
                            </SidebarProvider>
                            <Toaster />
                        </AppProviders>
                    </ThemeProvider>
                </ThemeWrapper>
            </body>
        </html>
    );
}
