import { useTRPC } from '@/lib/trpc';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@radix-ui/react-collapsible';
import { useQuery } from '@tanstack/react-query';
import { Building2, ChevronRight } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useState } from 'react';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '../ui/sidebar';
import { JoinGameDialog } from './JoinGameDialog';
import { Separator } from '../ui/separator';

export function CompanyNavEntry() {
    const { status } = useSession();
    const trpc = useTRPC();
    const [open, setOpen] = useState(false);
    const { isMobile, setOpenMobile } = useSidebar();

    const userQuery = useQuery(
        trpc.getUser.queryOptions({ userId: undefined }, { enabled: status === 'authenticated' }),
    );

    const agentQuery = useQuery(
        trpc.simulation.getAgentListSummaries.queryOptions(undefined, {
            enabled: status === 'authenticated' && !!userQuery.data?.agentId,
        }),
    );

    if (status !== 'authenticated') {
        return null;
    }

    const agentId = userQuery.data?.agentId;

    if (!agentId) {
        return (
            <SidebarMenuItem>
                <Separator className='my-4' />
                <JoinGameDialog />
            </SidebarMenuItem>
        );
    }

    const agent = agentQuery.data?.agents.find((a) => a.agentId === agentId);
    const companyName = agent?.name ?? 'My Company';

    const handleClick = () => {
        if (isMobile) {
            setOpenMobile(false);
        }
    };

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
                <SidebarMenuButton size='default' className='text-md w-full'>
                    <Building2 width={16} height={16} />
                    <span>{companyName}</span>
                    <ChevronRight
                        width={14}
                        height={14}
                        className='ml-auto transition-transform duration-200 data-[state=open]:rotate-90'
                        data-state={open ? 'open' : 'closed'}
                    />
                </SidebarMenuButton>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <SidebarMenu className='pl-2 pt-1'>
                    {
                        <SidebarMenuItem key={'workforce'}>
                            <SidebarMenuButton
                                asChild
                                size='sm'
                                className='font-normal text-muted-foreground'
                                onClick={handleClick}
                            >
                                <span>Economy</span>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    }
                </SidebarMenu>
            </CollapsibleContent>
        </Collapsible>
    );
}
