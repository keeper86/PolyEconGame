import { redirect } from 'next/navigation';

export default async function PlanetDetailPage(props: { params: Promise<{ planetId: string }> }) {
    const params = await props.params;
    redirect(`/planets/${encodeURIComponent(params.planetId)}/demographics`);
}
