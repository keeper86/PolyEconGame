import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { APP_ROUTES } from '@/lib/appRoutes';
import { Page } from '@/components/client/Page';

export default async function ImprintPage() {
    const [t, tNav] = await Promise.all([getTranslations('Imprint'), getTranslations('Nav')]);
    return (
        <Page title={tNav('Imprint')}>
            <div className='prose'>
                <p>{t('intro')}</p>
                <p>
                    {t('responsible')} <br />
                    Tobias
                    <br />
                    {t('email')} info@polyecongame.local
                </p>
                <p>{t('placeholder')}</p>
                {t('assets')}
            </div>
            <div className='mt-8'>
                <Link href={APP_ROUTES.root.path} className='btn btn-outline'>
                    {t('backToHome')}
                </Link>
            </div>
        </Page>
    );
}
