'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LogIn } from 'lucide-react';
import { signIn } from 'next-auth/react';

export function LoginCard() {
    return (
        <Card className='max-w-sm'>
            <CardHeader>
                <CardTitle>Sign in to play</CardTitle>
            </CardHeader>
            <CardContent>
                <Button className='w-full' onClick={() => signIn('keycloak', { callbackUrl: window.location.href })}>
                    <LogIn className='mr-2 h-4 w-4' />
                    Login / Register
                </Button>
            </CardContent>
        </Card>
    );
}
