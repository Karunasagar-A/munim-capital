import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, ScanFace, Sparkles, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type ChallengeId = "blink" | "turn" | "steady";
const CHALLENGES: { id: ChallengeId; label: string; hint: string }[] = [
  { id: "blink", label: "Blink twice", hint: "Close and open your eyes twice, clearly." },
  { id: "turn", label: "Turn head left", hint: "Slowly turn your head to the left, then back." },
  { id: "steady", label: "Hold steady", hint: "Look into the circle and keep still." },
];

const W = 96;
const H = 72;
const TICK_MS = 100;
const MIN_DWELL_TICKS = 10; // each challenge takes at least ~1s

interface Analyzer {
  prev: Uint8ClampedArray | null;
  baseline: number[];
  armed: boolean;
  blinks: number;
  turnScore: number;
  steadyRun: number;
  dwell: number;
}

const freshAnalyzer = (): Analyzer => ({
  prev: null,
  baseline: [],
  armed: true,
  blinks: 0,
  turnScore: 0,
  steadyRun: 0,
  dwell: 0,
});

export interface VKycResult {
  mode: "camera" | "simulated";
  snapshot: string | null;
}

export function VideoKyc({ verified, onVerified }: { verified: boolean; onVerified: (r: VKycResult) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyzer = useRef<Analyzer>(freshAnalyzer());

  const [mode, setMode] = useState<"idle" | "camera" | "simulated" | "done">(verified ? "done" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [stepProgress, setStepProgress] = useState(0);
  const [metrics, setMetrics] = useState({ motion: 0, light: 0 });

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const overall = mode === "done" ? 100 : Math.round(((index + stepProgress) / CHALLENGES.length) * 100);

  const finish = useCallback(
    (m: "camera" | "simulated") => {
      let snapshot: string | null = null;
      const v = videoRef.current;
      if (m === "camera" && v && v.videoWidth) {
        const c = document.createElement("canvas");
        c.width = 160;
        c.height = 120;
        const ctx = c.getContext("2d");
        if (ctx) {
          ctx.translate(160, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(v, 0, 0, 160, 120);
          snapshot = c.toDataURL("image/jpeg", 0.7);
        }
      }
      stopCamera();
      setMode("done");
      onVerified({ mode: m, snapshot });
    },
    [onVerified, stopCamera],
  );

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      analyzer.current = freshAnalyzer();
      setIndex(0);
      setStepProgress(0);
      setMode("camera");
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch (e) {
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Camera permission was blocked. Allow camera access, or use the simulated check."
          : "No camera found on this device. Use the simulated check instead.",
      );
    }
  }

  function startSimulated() {
    stopCamera();
    setError(null);
    setIndex(0);
    setStepProgress(0);
    setMode("simulated");
  }

  // Simulated challenge runner
  useEffect(() => {
    if (mode !== "simulated") return;
    let i = 0;
    let p = 0;
    const t = setInterval(() => {
      p += 0.08;
      if (p >= 1) {
        i += 1;
        p = 0;
        if (i >= CHALLENGES.length) {
          clearInterval(t);
          finish("simulated");
          return;
        }
        setIndex(i);
      }
      setStepProgress(p);
    }, TICK_MS);
    return () => clearInterval(t);
  }, [mode, finish]);

  // Canvas frame-sampling liveness engine
  useEffect(() => {
    if (mode !== "camera") return;
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
      canvasRef.current.width = W;
      canvasRef.current.height = H;
    }
    const ctx = canvasRef.current.getContext("2d", { willReadFrequently: true });
    let current = 0;

    const t = setInterval(() => {
      const v = videoRef.current;
      if (!ctx || !v || v.readyState < 2) return;
      ctx.drawImage(v, 0, 0, W, H);
      const { data } = ctx.getImageData(0, 0, W, H);
      const gray = new Uint8ClampedArray(W * H);
      let light = 0;
      for (let p = 0, g = 0; p < data.length; p += 4, g++) {
        const gv = (data[p]! * 0.299 + data[p + 1]! * 0.587 + data[p + 2]! * 0.114) | 0;
        gray[g] = gv;
        light += gv;
      }
      light /= W * H;

      const a = analyzer.current;
      let motion = 0;
      let cx = 0;
      let weight = 0;
      let n = 0;
      if (a.prev) {
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const nx = (x - W / 2) / (W * 0.32);
            const ny = (y - H / 2) / (H * 0.42);
            if (nx * nx + ny * ny > 1) continue; // inside the face oval only
            const i = y * W + x;
            const d = Math.abs(gray[i]! - a.prev[i]!);
            motion += d;
            n++;
            if (d > 25) {
              cx += x * d;
              weight += d;
            }
          }
        }
        motion /= n || 1;
      }
      a.prev = gray;
      if (motion === 0) return;

      if (a.baseline.length < 8) a.baseline.push(motion);
      const base = [...a.baseline].sort((x, y) => x - y)[Math.floor(a.baseline.length / 2)] ?? 1;
      const high = base + 2.5;
      const low = base + 1;
      const offset = weight ? cx / weight / W - 0.5 : 0;
      a.dwell++;
      setMetrics({ motion: Math.round(motion * 10) / 10, light: Math.round(light) });

      const ch = CHALLENGES[current]!.id;
      let progress = 0;
      if (ch === "blink") {
        if (a.armed && motion > high) {
          a.blinks++;
          a.armed = false;
        } else if (motion < low) a.armed = true;
        progress = a.blinks / 2;
      } else if (ch === "turn") {
        if (motion > high && Math.abs(offset) > 0.06) a.turnScore++;
        progress = a.turnScore / 6;
      } else {
        if (motion < low && light > 30) a.steadyRun++;
        else a.steadyRun = 0;
        progress = a.steadyRun / 18;
      }
      progress = Math.min(1, progress);
      setStepProgress(progress);

      if (progress >= 1 && a.dwell >= MIN_DWELL_TICKS) {
        current++;
        a.dwell = 0;
        a.blinks = 0;
        a.turnScore = 0;
        a.steadyRun = 0;
        a.armed = true;
        if (current >= CHALLENGES.length) {
          clearInterval(t);
          finish("camera");
          return;
        }
        setIndex(current);
        setStepProgress(0);
      }
    }, TICK_MS);
    return () => clearInterval(t);
  }, [mode, finish]);

  const running = mode === "camera" || mode === "simulated";
  const ch = CHALLENGES[Math.min(index, CHALLENGES.length - 1)]!;
  const R = 46;
  const C = 2 * Math.PI * R;

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="relative mx-auto aspect-square w-full max-w-[360px]">
        <div className="absolute inset-[6%] overflow-hidden rounded-full bg-primary-deep">
          {mode === "camera" && (
            <video
              ref={videoRef}
              muted
              playsInline
              className="h-full w-full -scale-x-100 object-cover"
            />
          )}
          {mode !== "camera" && (
            <div className="grid h-full w-full place-items-center text-primary-foreground/60">
              {mode === "done" ? (
                <CheckCircle2 className="size-20 text-success" />
              ) : (
                <ScanFace className={cn("size-24", mode === "simulated" && "animate-pulse")} />
              )}
            </div>
          )}
          {running && (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1/2 animate-scan bg-gradient-to-b from-transparent via-accent/25 to-transparent" />
          )}
        </div>
        <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" className="stroke-border" strokeWidth="2.5" />
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            className={cn("transition-all duration-200", mode === "done" ? "stroke-success" : "stroke-accent")}
            strokeDasharray={C}
            strokeDashoffset={C - (overall / 100) * C}
          />
        </svg>
        {mode === "done" && (
          <div className="absolute -right-2 bottom-6 animate-stamp rounded-md border-2 border-success bg-card px-3 py-1 font-mono text-sm font-bold uppercase tracking-widest text-success shadow-ledger">
            Live ✓
          </div>
        )}
      </div>

      <div className="flex flex-col justify-center">
        {mode === "done" ? (
          <div className="space-y-3">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-success">Liveness confirmed</p>
            <h4 className="text-3xl">You're verified on video.</h4>
            <p className="text-sm text-muted-foreground">
              All three liveness challenges passed. Your verification still has been attached to the application.
            </p>
            <Progress value={100} className="h-2 bg-success/15 [&>div]:bg-success" />
          </div>
        ) : running ? (
          <div className="space-y-5">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Challenge {index + 1} of {CHALLENGES.length}
              </p>
              <h4 className="mt-1 text-4xl">{ch.label}</h4>
              <p className="mt-1 text-sm text-muted-foreground">{ch.hint}</p>
            </div>
            <ul className="space-y-2">
              {CHALLENGES.map((c, i) => (
                <li key={c.id} className="flex items-center gap-2 text-sm">
                  {i < index ? (
                    <CheckCircle2 className="size-4 text-success" />
                  ) : (
                    <span
                      className={cn(
                        "size-4 rounded-full border-2",
                        i === index ? "border-accent bg-accent/30" : "border-border",
                      )}
                    />
                  )}
                  <span className={cn(i === index ? "font-semibold" : "text-muted-foreground")}>{c.label}</span>
                </li>
              ))}
            </ul>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold">
                <span>Liveness score</span>
                <span className="font-mono tabular">{overall}%</span>
              </div>
              <Progress value={overall} className="h-2.5 bg-secondary [&>div]:bg-marigold" />
            </div>
            {mode === "camera" && (
              <p className="font-mono text-[11px] text-muted-foreground">
                frame motion {metrics.motion} · light {metrics.light}
              </p>
            )}
            <Button variant="ghost" size="sm" onClick={() => { stopCamera(); setMode("idle"); }}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <h4 className="text-3xl">A 20-second video check.</h4>
            <p className="text-sm text-muted-foreground">
              We'll ask you to blink, turn your head and hold still. Frames are analysed in your browser — no video is
              uploaded.
            </p>
            {error && (
              <p className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                <VideoOff className="mt-0.5 size-4 shrink-0" /> {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="ledger" size="lg" onClick={startCamera}>
                <Camera /> Start camera
              </Button>
              <Button variant="outline" size="lg" onClick={startSimulated}>
                <Sparkles /> Simulated check
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
