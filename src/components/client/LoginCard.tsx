'use client';

import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogIn } from 'lucide-react';

export function LoginCard() {
    return (
        <Card className='max-w-sm'>
            <CardHeader>
                <CardTitle>Sign in to play</CardTitle>
                <CardDescription>Log in to access the game and all its features.</CardDescription>
            </CardHeader>
            <CardContent>
                <Button className='w-full' onClick={() => signIn('keycloak', { callbackUrl: window.location.href })}>
                    <LogIn className='mr-2 h-4 w-4' />
                    Login
                </Button>
            </CardContent>
        </Card>
    );
}
