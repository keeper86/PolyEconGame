'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LogIn } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { signIn } from 'next-auth/react';

export function LoginCard() {
    const t = useTranslations('Login');

    return (
        <Card className='max-w-sm'>
            <CardHeader>
                <CardTitle>{t('title')}</CardTitle>
            </CardHeader>
            <CardContent>
                <Button className='w-full' onClick={() => signIn('keycloak', { callbackUrl: window.location.href })}>
                    <LogIn className='mr-2 h-4 w-4' />
                    {t('action')}
                </Button>
            </CardContent>
        </Card>
    );
}
