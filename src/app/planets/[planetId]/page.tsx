import { redirect } from 'next/navigation';

export default function PlanetDetailPage({ params }: { params: { planetId: string } }) {
    redirect(`/planets/${encodeURIComponent(params.planetId)}/overview`);
}
