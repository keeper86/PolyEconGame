'use client';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RecipientPicker } from '@/app/messages/_components/RecipientPicker';
import { useSendMessage } from '@/hooks/useMessages';
import type { RecipientCandidate } from '@/lib/recipientSearch';
import { PenSquare } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export function ComposeMessageDialog() {
    const [open, setOpen] = useState(false);
    const [recipient, setRecipient] = useState<RecipientCandidate | null>(null);
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');

    const sendMessage = useSendMessage();

    const reset = () => {
        setRecipient(null);
        setSubject('');
        setBody('');
    };

    const canSubmit = recipient !== null && subject.trim() !== '' && body.trim() !== '';

    const handleSubmit = () => {
        if (recipient === null) {
            return;
        }
        sendMessage.mutate(
            { recipientUserId: recipient.userId, subject: subject.trim(), body: body.trim() },
            {
                onSuccess: () => {
                    toast.success('Message sent');
                    reset();
                    setOpen(false);
                },
                onError: (error) => {
                    toast.error(error instanceof Error ? error.message : 'Failed to send message');
                },
            },
        );
    };

    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        if (!next) {
            reset();
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button className='gap-2'>
                    <PenSquare className='h-4 w-4' />
                    New message
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>New message</DialogTitle>
                    <DialogDescription>Send a direct message to another player.</DialogDescription>
                </DialogHeader>

                <div className='flex flex-col gap-4 py-2'>
                    <div className='flex flex-col gap-2'>
                        <span className='text-sm font-medium leading-none'>Recipient</span>
                        <RecipientPicker value={recipient} onChange={setRecipient} />
                    </div>

                    <div className='flex flex-col gap-2'>
                        <Label htmlFor='message-subject'>Subject</Label>
                        <Input
                            id='message-subject'
                            value={subject}
                            maxLength={200}
                            onChange={(event) => setSubject(event.target.value)}
                        />
                    </div>

                    <div className='flex flex-col gap-2'>
                        <Label htmlFor='message-body'>Message</Label>
                        <textarea
                            id='message-body'
                            value={body}
                            maxLength={5000}
                            rows={6}
                            onChange={(event) => setBody(event.target.value)}
                            className='flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant='outline' onClick={() => handleOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button disabled={!canSubmit || sendMessage.isPending} onClick={handleSubmit}>
                        Send
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
