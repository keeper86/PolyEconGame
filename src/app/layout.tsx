import Footer from '@/app/Footer';
import AgentConditionIndicators from '@/components/client/AgentConditionIndicators';
import KeyStatDisplay from '@/components/client/KeyStatDisplay';
import { MessagesIndicator } from '@/components/client/MessagesIndicator';
import { SettingsMenu } from '@/components/client/SettingsMenu';
import TickDisplay from '@/components/client/TickDisplay';
import { AppSidebar } from '@/components/navigation/appSidebar';
import { ThemeProvider } from '@/components/themeProvider';
import ThemeWrapper from '@/components/themeWrapper';
import { TourJoyride } from '@/components/tour/TourJoyride';
import BackToTopButton from '@/components/ui/BackToTopButton';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
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

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Metadata');
    return {
        title: t('title'),
        description: t('description'),
    };
}

export default async function RootLayout({
    children,
}: Readonly<{
    children: ReactNode;
}>) {
    const session = await getServerSession(authOptions);
    const locale = await getLocale();

    return (
        <html lang={locale} suppressHydrationWarning>
            <body className={`${geistSans.variable} ${geistMono.variable}`}>
                <ThemeWrapper>
                    <ThemeProvider attribute='class' defaultTheme='system' enableSystem disableTransitionOnChange>
                        <NextIntlClientProvider>
                            <AppProviders session={session}>
                                <SidebarProvider className='h-dvh overflow-hidden'>
                                    <AppSidebar />
                                    <SidebarInset className='min-w-0 overflow-hidden'>
                                        <header className='sticky top-0 z-30 flex h-12 sm:h-14 shrink-0 items-center justify-between gap-2 px-2 sm:px-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60'>
                                            <div className='flex items-center gap-2 '>
                                                <SidebarTrigger className='-ml-1' />
                                                <MessagesIndicator />
                                                <AgentConditionIndicators />
                                            </div>
                                            <div className='flex items-center gap-2'>
                                                <KeyStatDisplay />

                                                <TickDisplay />

                                                <SettingsMenu />
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
                        </NextIntlClientProvider>
                    </ThemeProvider>
                </ThemeWrapper>
            </body>
        </html>
    );
}
