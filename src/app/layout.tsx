import Footer from '@/app/Footer';
import TickDisplay from '@/components/client/TickDisplay';
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
    description:
        'Simulate and manage a workforce in a dynamic economic environment. Explore the impact of demographic changes, education levels, and economic policies on your planet’s economy.',
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
                            <SidebarProvider>
                                <AppSidebar />
                                <SidebarInset>
                                    <header className='sticky top-0 z-30 flex h-12 sm:h-14 shrink-0 items-center justify-between gap-2 px-2 sm:px-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60'>
                                        <div className='flex items-center gap-2 '>
                                            <SidebarTrigger className='-ml-1' />
                                        </div>
                                        <div className='flex items-center gap-2'>
                                            <span className='text-sm text-muted-foreground flex items-center gap-1'>
                                                <TickDisplay />
                                            </span>
                                            <ModeToggle />
                                        </div>
                                    </header>
                                    <main className='flex-1 p-2 sm:p-4 overflow-x-auto break-words'>{children}</main>
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
