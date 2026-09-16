import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Original illustrations for the marketing site, drawn in the ChefoTech palette. They show what the
 * product actually does at the counter and in the store room, so nothing here is stock imagery.
 */

const NAVY = '#1b3f7c';
const BLUE = '#2b7cc4';
const YELLOW = '#f4b223';
const RED = '#e1332a';
const TEAL = '#0f766e';
const INK = '#0f172a';
const LINE = '#cbd5e1';
const PAPER = '#ffffff';
const PANEL = '#f1f5f9';

/** A run of barcode bars with a stable, repeatable pattern. */
function Bars({ x, y, w, h, seed = 3, color = INK }: { x: number; y: number; w: number; h: number; seed?: number; color?: string }) {
  const pattern = [1, 2, 1, 1, 3, 1, 2, 1, 1, 2, 3, 1, 1, 2, 1, 3, 1, 1, 2, 1, 1, 3, 2, 1];
  const total = pattern.reduce((a, b) => a + b, 0) * 2;
  const unit = w / total;
  let cursor = x;
  const bars: ReactNode[] = [];
  pattern.forEach((p, i) => {
    const width = p * unit * ((i + seed) % 3 === 0 ? 1.2 : 1);
    bars.push(<rect key={i} x={cursor} y={y} width={width} height={h} fill={color} />);
    cursor += width + unit * 1.2;
  });
  return <g>{bars}</g>;
}

/** The counter: a scanner reads the pack and the line appears on the bill. */
export function ScanAtCounter({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 520 340" className={cn('h-auto w-full', className)} role="img" aria-labelledby="scan-counter-title">
      <title id="scan-counter-title">A barcode scanner reads a medicine pack and the item appears on the bill</title>
      {/* POS screen */}
      <rect x="230" y="34" width="262" height="176" rx="12" fill={PAPER} stroke={LINE} strokeWidth="2" />
      <rect x="230" y="34" width="262" height="28" rx="12" fill={PANEL} />
      <circle cx="248" cy="48" r="4" fill={LINE} />
      <circle cx="262" cy="48" r="4" fill={LINE} />
      <circle cx="276" cy="48" r="4" fill={LINE} />
      <rect x="246" y="74" width="230" height="22" rx="6" fill={PANEL} />
      <rect x="256" y="81" width="90" height="8" rx="4" fill={LINE} />
      {/* bill lines */}
      <rect x="246" y="108" width="230" height="1" fill={LINE} />
      <rect x="252" y="118" width="120" height="8" rx="4" fill={INK} opacity="0.85" />
      <rect x="252" y="131" width="70" height="6" rx="3" fill={LINE} />
      <rect x="420" y="118" width="52" height="8" rx="4" fill={INK} opacity="0.85" />
      <rect x="246" y="146" width="230" height="1" fill={LINE} />
      <rect x="252" y="156" width="140" height="8" rx="4" fill={TEAL} />
      <rect x="252" y="169" width="60" height="6" rx="3" fill={LINE} />
      <rect x="420" y="156" width="52" height="8" rx="4" fill={TEAL} />
      <rect x="246" y="184" width="230" height="1" fill={LINE} />
      <rect x="360" y="192" width="112" height="10" rx="5" fill={NAVY} />
      {/* stand */}
      <rect x="340" y="210" width="40" height="26" fill={LINE} />
      <rect x="300" y="236" width="120" height="8" rx="4" fill={LINE} />

      {/* medicine pack */}
      <g transform="translate(60 150) rotate(-8)">
        <rect x="0" y="0" width="150" height="96" rx="8" fill={PAPER} stroke={LINE} strokeWidth="2" />
        <rect x="0" y="0" width="150" height="26" rx="8" fill={TEAL} />
        <rect x="0" y="18" width="150" height="8" fill={TEAL} />
        <rect x="12" y="9" width="70" height="8" rx="4" fill={PAPER} opacity="0.9" />
        <rect x="12" y="38" width="90" height="6" rx="3" fill={INK} opacity="0.7" />
        <rect x="12" y="50" width="60" height="5" rx="2.5" fill={LINE} />
        <Bars x={14} y={62} w={100} h={24} seed={2} />
        <rect x="120" y="62" width="18" height="24" rx="2" fill={PANEL} />
      </g>

      {/* scanner */}
      <g transform="translate(150 60) rotate(28)">
        <rect x="0" y="0" width="86" height="40" rx="14" fill={NAVY} />
        <rect x="64" y="8" width="26" height="24" rx="6" fill={RED} opacity="0.9" />
        <rect x="70" y="14" width="14" height="12" rx="3" fill="#ff8a80" />
        <rect x="18" y="34" width="26" height="54" rx="10" fill={INK} />
        <circle cx="30" cy="44" r="4" fill={YELLOW} />
      </g>
      {/* beam */}
      <path d="M252 122 L120 176" stroke={RED} strokeWidth="3" strokeDasharray="8 6" strokeLinecap="round" opacity="0.8" />
      <circle cx="120" cy="176" r="6" fill={RED} opacity="0.35" />

      {/* caption chip */}
      <rect x="230" y="262" width="262" height="40" rx="20" fill={PANEL} />
      <circle cx="252" cy="282" r="8" fill={TEAL} />
      <path d="M248 282 L251 285 L257 279" stroke={PAPER} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="268" y="278" width="150" height="8" rx="4" fill={INK} opacity="0.75" />
    </svg>
  );
}

/** A pack with its barcode, batch and expiry: the barcode finds the product, the pack gives the rest. */
export function PackWithBarcode({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 520 340" className={cn('h-auto w-full', className)} role="img" aria-labelledby="pack-title">
      <title id="pack-title">A medicine pack showing its barcode, batch number and expiry date, matched to a product in the catalogue</title>
      {/* pack */}
      <g transform="translate(40 60)">
        <rect x="0" y="0" width="240" height="200" rx="14" fill={PAPER} stroke={LINE} strokeWidth="2" />
        <rect x="0" y="0" width="240" height="56" rx="14" fill={BLUE} />
        <rect x="0" y="40" width="240" height="16" fill={BLUE} />
        <rect x="20" y="18" width="120" height="12" rx="6" fill={PAPER} opacity="0.95" />
        <rect x="20" y="34" width="70" height="7" rx="3.5" fill={PAPER} opacity="0.7" />
        <rect x="20" y="74" width="80" height="8" rx="4" fill={INK} opacity="0.7" />
        <rect x="20" y="88" width="120" height="6" rx="3" fill={LINE} />
        {/* batch / expiry block */}
        <rect x="20" y="106" width="200" height="36" rx="8" fill={PANEL} />
        <text x="30" y="121" fontFamily="ui-monospace, Menlo, monospace" fontSize="11" fill={INK}>Batch  MLC2405</text>
        <text x="30" y="136" fontFamily="ui-monospace, Menlo, monospace" fontSize="11" fill={INK}>Exp    08/2027</text>
        <Bars x={20} y={154} w={170} h={30} seed={5} />
        <text x="20" y="194" fontFamily="ui-monospace, Menlo, monospace" fontSize="9" fill={INK} opacity="0.7">8 901234 567890</text>
      </g>

      {/* link to catalogue card */}
      <path d="M290 160 C 320 160, 320 150, 350 150" stroke={YELLOW} strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="350" cy="150" r="5" fill={YELLOW} />

      {/* product card */}
      <g transform="translate(350 88)">
        <rect x="0" y="0" width="140" height="124" rx="12" fill={PAPER} stroke={LINE} strokeWidth="2" />
        <rect x="14" y="16" width="86" height="9" rx="4.5" fill={INK} opacity="0.85" />
        <rect x="14" y="31" width="60" height="6" rx="3" fill={LINE} />
        <rect x="14" y="50" width="112" height="1" fill={LINE} />
        <rect x="14" y="60" width="40" height="6" rx="3" fill={LINE} />
        <rect x="80" y="58" width="46" height="10" rx="5" fill={TEAL} />
        <rect x="14" y="76" width="40" height="6" rx="3" fill={LINE} />
        <rect x="80" y="74" width="46" height="10" rx="5" fill={PANEL} />
        <rect x="14" y="92" width="40" height="6" rx="3" fill={LINE} />
        <rect x="80" y="90" width="46" height="10" rx="5" fill={PANEL} />
        <circle cx="122" cy="20" r="8" fill={TEAL} />
        <path d="M118 20 L121 23 L127 17" stroke={PAPER} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* caption */}
      <rect x="350" y="232" width="140" height="28" rx="14" fill={PANEL} />
      <rect x="366" y="242" width="108" height="8" rx="4" fill={INK} opacity="0.7" />
    </svg>
  );
}

/** Printing shelf labels for loose or unlabelled items so they scan like everything else. */
export function PrintLabels({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 520 340" className={cn('h-auto w-full', className)} role="img" aria-labelledby="labels-title">
      <title id="labels-title">Barcode labels printed from the product page and stuck on loose items</title>
      {/* label printer */}
      <g transform="translate(60 90)">
        <rect x="0" y="30" width="180" height="110" rx="16" fill={NAVY} />
        <rect x="16" y="14" width="148" height="40" rx="10" fill={INK} />
        <rect x="30" y="0" width="120" height="30" rx="8" fill={PANEL} />
        <rect x="150" y="70" width="34" height="14" rx="7" fill={YELLOW} />
        <rect x="24" y="96" width="132" height="6" rx="3" fill={BLUE} opacity="0.6" />
      </g>
      {/* label strip coming out */}
      <g transform="translate(190 118)">
        <rect x="0" y="0" width="150" height="70" rx="8" fill={PAPER} stroke={LINE} strokeWidth="2" />
        <rect x="12" y="10" width="88" height="7" rx="3.5" fill={INK} opacity="0.8" />
        <Bars x={12} y={24} w={112} h={28} seed={1} />
        <text x="12" y="62" fontFamily="ui-monospace, Menlo, monospace" fontSize="8" fill={INK} opacity="0.7">PH-000412</text>
      </g>
      <g transform="translate(350 128) rotate(6)">
        <rect x="0" y="0" width="150" height="70" rx="8" fill={PAPER} stroke={LINE} strokeWidth="2" />
        <rect x="12" y="10" width="70" height="7" rx="3.5" fill={INK} opacity="0.8" />
        <Bars x={12} y={24} w={112} h={28} seed={4} />
        <text x="12" y="62" fontFamily="ui-monospace, Menlo, monospace" fontSize="8" fill={INK} opacity="0.7">PH-000413</text>
      </g>
      {/* jar with label */}
      <g transform="translate(380 200)">
        <rect x="0" y="0" width="90" height="100" rx="14" fill={PANEL} stroke={LINE} strokeWidth="2" />
        <rect x="8" y="-14" width="74" height="22" rx="8" fill={RED} />
        <rect x="14" y="44" width="62" height="34" rx="4" fill={PAPER} stroke={LINE} />
        <Bars x={18} y={50} w={54} h={16} seed={2} />
        <rect x="18" y="70" width="30" height="4" rx="2" fill={LINE} />
      </g>
      {/* tick chip */}
      <rect x="60" y="230" width="220" height="40" rx="20" fill={PANEL} />
      <circle cx="82" cy="250" r="8" fill={TEAL} />
      <path d="M78 250 L81 253 L87 247" stroke={PAPER} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="98" y="246" width="160" height="8" rx="4" fill={INK} opacity="0.75" />
    </svg>
  );
}
