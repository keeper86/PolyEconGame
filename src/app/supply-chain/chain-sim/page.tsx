import { Page } from '@/components/client/Page';
import ChainSimTool from './_components/ChainSimTool';

export const metadata = {
    title: 'Supply Chain Simulator',
    description: 'Multi-node supply chain simulation with PID production control and pricing',
};

export default function ChainSimPage() {
    return (
        <Page title='Supply Chain Simulator'>
            <ChainSimTool />
        </Page>
    );
}
