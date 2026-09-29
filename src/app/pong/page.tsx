import { Page } from '@/components/client/Page';
import { getTranslations } from 'next-intl/server';

export default async function PongPage() {
    const t = await getTranslations('Nav');
    return (
        <Page title={t('Paddle War')}>
            <div className='flex items-center justify-center min-h-screen p-8 bg-gray-50'>
                <div
                    className='w-full max-w-5xl aspect-[4/3] border rounded-lg overflow-hidden shadow-lg flex'
                    style={{ minHeight: '60vh' }}
                >
                    <iframe
                        src='https://keeper190786.gitlab.io/pong'
                        title={t('pongFrameTitle')}
                        style={{ width: '100%', height: '100%', border: 'none', background: 'white' }}
                        allowFullScreen
                    />
                </div>
            </div>
        </Page>
    );
}
