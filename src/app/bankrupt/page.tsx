import { authOptions } from '@/app/api/auth/[...nextauth]/authOptions';
import { BankruptcyNotice } from '@/components/client/BankruptcyNotice';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

export default async function BankruptPage() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        redirect('/');
    }

    return <BankruptcyNotice />;
}
