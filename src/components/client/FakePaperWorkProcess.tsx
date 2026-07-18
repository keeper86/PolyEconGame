import { Check, ChevronRight, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

const SERIOUS_POOL = [
    'Analyzing planetary macro-economic liquidity corridors.',
    'Syncing sub-orbital supply chain telemetry.',
    'Verifying multi-signature cryptographic escrow vaults.',
    'Establishing secure, quantum-encrypted planetary VPN pipelines.',
    'Structuring corporate bond collateralization frameworks.',
    'Conducting deep-space market penetration feasibility sweeps.',
    'Registering with local planetary labor unions.',
    'Signing digital ownership deeds.',
    'Evaluating market conditions.',
];

const FUNNY_POOL = [
    'Bribing planetary customs officials (allocating slush fund).',
    'Optimizing corporate liability waivers for accidental airlock depressurization.',
    'Routing initial capital through three different offshore asteroid belts.',
    'Filing planetary environmental impact forms in triplicate.',
    'Negotiating minimum nutrient-paste requirements with local union reps.',
    'Purging space-barnacles from the corporate servers.',
    'Drafting non-disclosure agreements for sentient planetary flora.',
    'Scheduling mandatory, unpaid virtual synergy seminars.',
    'Sourcing unpaid interns from regional cryogenic storage facilities.',
    'Bathing the mainframe server racks in holy incense to appease the machine spirit.',
    'Anesthetizing the legal department.',
    'Translating corporate bylaws into Neo-Sumerian for local magistrates.',
    'Re-calibrating the quantum breakroom microwave.',
    'Filing form 1040-Z (Interstellar Tax Return for Non-Biological Entities).',
    'Plausibly denying initial insider trading allegations.',
    'Rerouting toxic waste pipelines away from executive parking lots.',
    'Ensuring minimum carbon-footprint violations are met.',
    'Replacing Board of Directors with slightly more cooperative synthetic clones.',
    'Pumping fresh oxygen (95% air, 5% loyalty blend) into offices.',
    'Paying off local space-pirate protection syndicates.',
    'Generating synergistic, paradigm-shifting corporate buzzwords.',
    'Securing insurance policy against localized temporal anomalies.',
    'Covering up minor atmospheric ignition incident during server startup.',
];

const META_POOL = [
    'Consulting an authentic, adaptive AI collaborator with a touch of wit.',
    'Injecting CSS resets directly into the local fabric of space-time.',
    'Checking if the developer accidentally committed the API keys to GitHub.',
    'Blaming the database. It’s always the database.',
    'Garbage collecting unused existential consciousness threads.',
    'Running npm install --force on the planetary infrastructure.',
    'Trying to figure out why useEffect is running twice on startup.',
    'Parsing stringified JSON payloads with mild existential dread.',
    "Applying emergency hotfixes directly in production (don't tell anyone).",
];

const STATIC_FIRST_STEPS = [
    'Registering Corporate Entity.',
    'Securing initial financial rights.',
    'Opening reserve accounts with Central Bank.',
    'Securing initial labor rights.',
    'Submitting corporate charter to planetary administration.',
];

const STATIC_LAST_STEPS = [
    'Awaiting final planetary registry approval (this may take a while)...',
    'But usually...',
    '...not that long.',
    'Still awaiting final planetary registry approval (this may take a while)...',
    'Maybe you try to reload the page?',
    'At this point, I cannot promise that something will happen.',
    'Waiting... Waiting... Waiting...',
];

const STATIC_LAST_STEP_DELAYS = [10000, 2000, 3000, 10000, 10000, 20000];

export function getRegistrySteps(): string[] {
    // Shufflers
    const drawRandom = (arr: string[], count: number) => {
        return [...arr].sort(() => 0.5 - Math.random()).slice(0, count);
    };

    const seriousLogs = drawRandom(SERIOUS_POOL, 6);
    const funnyLogs = drawRandom(FUNNY_POOL, 7);
    const metaLogs = drawRandom(META_POOL, 3);

    return [...STATIC_FIRST_STEPS, ...seriousLogs, ...funnyLogs, ...metaLogs, ...STATIC_LAST_STEPS];
}

interface TypewriterStepProps {
    text: string;
    isActive: boolean;
    isCompleted: boolean;
    isLastStep: boolean;
    processingDelay: number;
    onStepComplete: () => void;
}

function TypewriterStep({
    text,
    isActive,
    isCompleted,
    isLastStep,
    processingDelay,
    onStepComplete,
}: TypewriterStepProps) {
    const [typedText, setTypedText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    // Sync state when active/completed props change
    useEffect(() => {
        if (isCompleted) {
            setTypedText(text);
            setIsTyping(false);
            setIsProcessing(false);
        } else if (isActive) {
            setTypedText('');
            setIsTyping(true);
            setIsProcessing(false);
        }
    }, [isActive, isCompleted, text]);

    // natural character-by-character typing effect
    useEffect(() => {
        if (!isActive || !isTyping) {
            return;
        }

        let currentIndex = 0;
        let timeoutId: NodeJS.Timeout;

        const typeCharacter = () => {
            if (currentIndex < text.length) {
                setTypedText(text.slice(0, currentIndex + 1));
                currentIndex++;
                // Natural typing pacing with slight random variation
                let nextDelay = Math.random() * 40 + 2;
                if (Math.random() < 0.005) {
                    nextDelay += 200;
                }
                if (Math.random() < 0.001) {
                    nextDelay += 500;
                }
                timeoutId = setTimeout(typeCharacter, nextDelay);
            } else {
                setIsTyping(false);
                setIsProcessing(true);
            }
        };

        timeoutId = setTimeout(typeCharacter, 50);
        return () => clearTimeout(timeoutId);
    }, [isActive, isTyping, text]);

    // Keep the spinner spinning for a moment before declaring the step complete
    useEffect(() => {
        if (!isActive || !isProcessing) {
            return;
        }
        if (isLastStep) {
            return;
        } // Keep spinning indefinitely on the final tick step until page redirected

        const timer = setTimeout(() => {
            onStepComplete();
        }, processingDelay);

        return () => clearTimeout(timer);
    }, [isActive, isProcessing, isLastStep, onStepComplete, processingDelay]);

    // Handle status icons
    let icon = <div className='h-4 w-4 shrink-0' />;
    if (isCompleted) {
        icon = <Check className='h-4 w-4 text-emerald-500/60 shrink-0 mt-0.5' />;
    } else if (isActive) {
        if (isTyping) {
            icon = <ChevronRight className='h-4 w-4 text-primary shrink-0 mt-0.5' />;
        } else if (isProcessing || isLastStep) {
            icon = <Loader2 className='h-4 w-4 animate-spin text-primary shrink-0 mt-0.5' />;
        }
    }

    return (
        <div
            data-active={isActive ? 'true' : undefined}
            className={`flex items-start gap-3 transition-all duration-300 ${
                isCompleted
                    ? 'text-muted-foreground/45 scale-[0.99] origin-left'
                    : isActive
                      ? 'text-foreground font-medium'
                      : 'opacity-0 h-0 overflow-hidden'
            }`}
        >
            {icon}
            <span className='relative'>
                {typedText}
                {isActive && isTyping && (
                    <span className='inline-block w-1.5 h-4 ml-0.5 bg-primary animate-pulse align-middle' />
                )}
            </span>
        </div>
    );
}

export function InteractivePaperworkProcess() {
    const [currentStep, setCurrentStep] = useState(0);
    const steps = useMemo(() => getRegistrySteps(), []);
    const cardRef = useRef<HTMLSpanElement>(null);

    const stepsBeforeLast = steps.length - STATIC_LAST_STEPS.length;

    // Only render steps that have already been reached
    const visibleSteps = steps.slice(0, currentStep + 1);

    // Scroll the active step into view when it changes
    useEffect(() => {
        if (!cardRef.current) {
            return;
        }
        const activeElement = cardRef.current.querySelector('[data-active="true"]');
        if (activeElement) {
            activeElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    }, [currentStep]);

    return (
        <span
            ref={cardRef}
            className='font-mono text-xs sm:text-sm w-full bg-card/60 backdrop-blur-sm shadow-inner overflow-y-auto'
        >
            {visibleSteps.map((step, index) => {
                const isCompleted = index < currentStep;
                const isActive = index === currentStep;
                const isLastStep = index === steps.length - 1;

                const lastStepIndex = index - stepsBeforeLast;
                const indexFactor = 0.5 + index / steps.length;
                const processingDelay =
                    lastStepIndex >= 0 && lastStepIndex < STATIC_LAST_STEP_DELAYS.length
                        ? STATIC_LAST_STEP_DELAYS[lastStepIndex] * indexFactor
                        : Math.floor(Math.random() * 2000) + 1000 * indexFactor;

                return (
                    <TypewriterStep
                        key={`${index}-${step}`}
                        text={step}
                        isActive={isActive}
                        isCompleted={isCompleted}
                        isLastStep={isLastStep}
                        processingDelay={processingDelay}
                        onStepComplete={() => setCurrentStep((prev) => prev + 1)}
                    />
                );
            })}
        </span>
    );
}
