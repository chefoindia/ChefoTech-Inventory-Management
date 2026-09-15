'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Type, Image as ImageIcon, Minus, Square, Table2, Barcode, QrCode, Hash, PenLine, Trash2, Copy, ZoomIn, ZoomOut, Lock, Unlock, ArrowUp, ArrowDown } from 'lucide-react';
import { PAGE_SIZES, PAGE_DIMENSIONS, FONT_FAMILIES, type TemplateLayout, type TemplateElement, type ElementStyle, type DocumentTemplateType } from '@pharmaos/shared';
import type { TemplateCatalogue } from './api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea, Checkbox } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

type ElementType = TemplateElement['type'];
const PALETTE: { type: ElementType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: 'text', label: 'Text', icon: Type },
  { type: 'image', label: 'Logo / image', icon: ImageIcon },
  { type: 'line', label: 'Line', icon: Minus },
  { type: 'rect', label: 'Box', icon: Square },
  { type: 'table', label: 'Table', icon: Table2 },
  { type: 'barcode', label: 'Barcode', icon: Barcode },
  { type: 'qrcode', label: 'QR code', icon: QrCode },
  { type: 'pageNumber', label: 'Page number', icon: Hash },
  { type: 'signature', label: 'Signature', icon: PenLine },
];

const uid = () => `el_${Math.random().toString(36).slice(2, 8)}`;

function newElement(type: ElementType, x: number, y: number, tableColumns: TemplateCatalogue['tableColumns']): TemplateElement {
  const base = { id: uid(), x, y, style: { fontSize: 9 } as ElementStyle };
  switch (type) {
    case 'text': return { ...base, type, width: 160, height: 16, text: 'Text' };
    case 'image': return { ...base, type, width: 80, height: 40, src: 'organization.logo', fit: 'contain' };
    case 'line': return { ...base, type, width: 200, height: 1, orientation: 'horizontal', style: { borderWidth: 0.5, borderColor: '#000000' } };
    case 'rect': return { ...base, type, width: 120, height: 60, style: { borderWidth: 0.5, borderColor: '#000000' } };
    case 'table': {
      const cols = (tableColumns.items ?? []).slice(0, 5);
      return { ...base, type, width: 500, height: 200, collection: 'items', columns: cols.length ? cols.map((c, i) => ({ key: c.key, label: c.label, width: Math.round(100 / cols.length), align: (c.format === 'money' || c.format === 'qty' || c.format === 'number' ? 'right' : i === 0 ? 'left' : 'left') as 'left' | 'right' | 'center', format: (['money', 'qty', 'date', 'percent', 'index'].includes(c.format) ? c.format : 'text') as 'text' | 'money' | 'qty' | 'date' | 'percent' | 'index', visible: true })) : [{ key: 'name', label: 'Item', width: 60, align: 'left', format: 'text', visible: true }, { key: 'totalMinor', label: 'Amount', width: 40, align: 'right', format: 'money', visible: true }], zebra: false, rowHeight: 16, grow: true };
    }
    case 'barcode': return { ...base, type, width: 120, height: 40, value: '{{document.number}}', symbology: 'code128', showText: true };
    case 'qrcode': return { ...base, type, width: 60, height: 60, value: '{{document.number}}' };
    case 'pageNumber': return { ...base, type, width: 120, height: 12, text: 'Page {{page}} of {{pages}}', style: { fontSize: 8, align: 'right' } };
    case 'signature': return { ...base, type, width: 140, height: 40, label: 'Authorised signatory' };
  }
}

function pageDims(layout: TemplateLayout) {
  const d = PAGE_DIMENSIONS[layout.pageSize];
  const w = layout.orientation === 'landscape' ? d.height : d.width;
  const h = layout.orientation === 'landscape' ? d.width : d.height;
  return { w, h, continuous: d.continuous };
}

/** Canva-style drag/resize designer for absolutely positioned PDF templates. Units are PDF points. */
export function TemplateDesigner({ layout, onChange, catalogue, documentType, readOnly }: { layout: TemplateLayout; onChange: (l: TemplateLayout) => void; catalogue: TemplateCatalogue; documentType: DocumentTemplateType; readOnly?: boolean }) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [zoom, setZoom] = React.useState(1);
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<{ id: string; mode: 'move' | 'resize'; startX: number; startY: number; ox: number; oy: number; ow: number; oh: number } | null>(null);
  const { w, h } = pageDims(layout);
  const selected = layout.elements.find((e) => e.id === selectedId) ?? null;

  const setElements = (els: TemplateElement[]) => onChange({ ...layout, elements: els });
  const patch = (id: string, p: Partial<TemplateElement>) => setElements(layout.elements.map((e) => (e.id === id ? ({ ...e, ...p } as TemplateElement) : e)));
  const add = (type: ElementType) => {
    if (readOnly) return;
    const el = newElement(type, layout.margins.left, layout.margins.top + 20, catalogue.tableColumns);
    setElements([...layout.elements, el]);
    setSelectedId(el.id);
  };
  const remove = (id: string) => { setElements(layout.elements.filter((e) => e.id !== id)); if (selectedId === id) setSelectedId(null); };
  const duplicate = (id: string) => { const src = layout.elements.find((e) => e.id === id); if (!src) return; const copy = { ...src, id: uid(), x: src.x + 10, y: src.y + 10 } as TemplateElement; setElements([...layout.elements, copy]); setSelectedId(copy.id); };
  const reorder = (id: string, dir: -1 | 1) => { const i = layout.elements.findIndex((e) => e.id === id); const j = i + dir; if (i < 0 || j < 0 || j >= layout.elements.length) return; const els = [...layout.elements]; [els[i], els[j]] = [els[j]!, els[i]!]; setElements(els); };

  const onPointerDown = (e: React.PointerEvent, el: TemplateElement, mode: 'move' | 'resize') => {
    if (readOnly || el.locked) { setSelectedId(el.id); return; }
    e.stopPropagation();
    setSelectedId(el.id);
    drag.current = { id: el.id, mode, startX: e.clientX, startY: e.clientY, ox: el.x, oy: el.y, ow: el.width, oh: el.height };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const dx = (e.clientX - d.startX) / zoom; const dy = (e.clientY - d.startY) / zoom;
    if (d.mode === 'move') patch(d.id, { x: Math.max(0, Math.round(d.ox + dx)), y: Math.max(0, Math.round(d.oy + dy)) });
    else patch(d.id, { width: Math.max(4, Math.round(d.ow + dx)), height: Math.max(1, Math.round(d.oh + dy)) });
  };
  const onPointerUp = () => { drag.current = null; };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selected || readOnly) return;
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(selected.id); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); patch(selected.id, { x: Math.max(0, selected.x - step) }); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); patch(selected.id, { x: selected.x + step }); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); patch(selected.id, { y: Math.max(0, selected.y - step) }); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); patch(selected.id, { y: selected.y + step }); }
      else if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); duplicate(selected.id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, readOnly, layout]);

  const insertBinding = (key: string) => {
    if (readOnly) return;
    if (selected && selected.type === 'text') patch(selected.id, { text: `${selected.text}${selected.text && !selected.text.endsWith(' ') ? ' ' : ''}{{${key}}}` } as Partial<TemplateElement>);
    else { const el = { ...newElement('text', layout.margins.left, layout.margins.top + 20, catalogue.tableColumns), text: `{{${key}}}` } as TemplateElement; setElements([...layout.elements, el]); setSelectedId(el.id); }
  };

  return (
    <div className="grid min-h-[70vh] grid-cols-1 gap-3 lg:grid-cols-[200px_1fr_300px]">
      {/* palette */}
      <div className="space-y-3 rounded-[var(--radius-card)] border border-border bg-surface p-3">
        <div className="text-[12px] font-semibold uppercase tracking-wide text-fg-subtle">Add element</div>
        <div className="grid grid-cols-2 gap-1.5">
          {PALETTE.map((p) => <button key={p.type} type="button" disabled={readOnly} onClick={() => add(p.type)} className="flex flex-col items-center gap-1 rounded-[var(--radius-control)] border border-border px-2 py-2 text-[11px] hover:bg-surface-subtle disabled:opacity-50"><p.icon className="h-4 w-4 text-fg-subtle" />{p.label}</button>)}
        </div>
        <div className="text-[12px] font-semibold uppercase tracking-wide text-fg-subtle">Fields</div>
        <div className="max-h-[50vh] space-y-2 overflow-y-auto scroll-thin pr-1">
          {catalogue.bindings.map((g) => (
            <details key={g.group} className="text-[12px]">
              <summary className="cursor-pointer font-medium">{g.group}</summary>
              <ul className="mt-1 space-y-0.5 pl-2">{g.bindings.map((b) => <li key={b.key}><button type="button" disabled={readOnly} className="w-full truncate rounded px-1 py-0.5 text-left hover:bg-surface-subtle" title={b.key} onClick={() => insertBinding(b.key)}>{b.label}</button></li>)}</ul>
            </details>
          ))}
        </div>
      </div>

      {/* canvas */}
      <div className="flex flex-col rounded-[var(--radius-card)] border border-border bg-surface-muted">
        <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2 text-[12px] text-fg-subtle">
          <span>{layout.pageSize} · {layout.orientation} · {Math.round(w)}×{Math.round(h)} pt</span>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(1)))}><ZoomOut className="h-4 w-4" /></Button>
            <span className="w-10 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon-sm" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(1)))}><ZoomIn className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto scroll-thin p-6" onPointerDown={() => setSelectedId(null)}>
          <div ref={canvasRef} className="relative mx-auto bg-white shadow-md" style={{ width: w * zoom, height: h * zoom }} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
            {/* margins & bands */}
            <div className="pointer-events-none absolute border border-dashed border-primary-300/60" style={{ left: layout.margins.left * zoom, top: layout.margins.top * zoom, width: (w - layout.margins.left - layout.margins.right) * zoom, height: (h - layout.margins.top - layout.margins.bottom) * zoom }} />
            {layout.headerHeight ? <div className="pointer-events-none absolute left-0 right-0 border-b border-dashed border-warning-600/50" style={{ top: (layout.margins.top + layout.headerHeight) * zoom }}><span className="absolute right-1 -top-4 text-[10px] text-warning-700">header</span></div> : null}
            {layout.footerHeight ? <div className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-warning-600/50" style={{ top: (h - layout.margins.bottom - layout.footerHeight) * zoom }}><span className="absolute right-1 top-0 text-[10px] text-warning-700">footer</span></div> : null}
            {layout.elements.map((el) => (
              <ElementBox key={el.id} el={el} zoom={zoom} selected={el.id === selectedId} defaultStyle={layout.defaultStyle} onPointerDown={(e, mode) => onPointerDown(e, el, mode)} readOnly={!!readOnly || !!el.locked} />
            ))}
          </div>
        </div>
      </div>

      {/* properties */}
      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-3">
        <Tabs defaultValue="element">
          <TabsList><TabsTrigger value="element">Element</TabsTrigger><TabsTrigger value="page">Page</TabsTrigger></TabsList>
          <TabsContent value="element">
            {!selected ? <p className="text-[13px] text-fg-subtle">Select an element on the page, or add one from the palette.</p> : (
              <ElementProps el={selected} onChange={(p) => patch(selected.id, p)} onRemove={() => remove(selected.id)} onDuplicate={() => duplicate(selected.id)} onReorder={(d) => reorder(selected.id, d)} catalogue={catalogue} readOnly={!!readOnly} />
            )}
          </TabsContent>
          <TabsContent value="page">
            <PageProps layout={layout} onChange={onChange} readOnly={!!readOnly} documentType={documentType} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function styleToCss(s: ElementStyle | undefined, d: ElementStyle | undefined, zoom: number): React.CSSProperties {
  const st = { ...d, ...s };
  return {
    fontFamily: st.fontFamily === 'Courier' ? 'ui-monospace, monospace' : st.fontFamily === 'Times-Roman' ? 'Times New Roman, serif' : 'Helvetica, Arial, sans-serif',
    fontSize: (st.fontSize ?? 9) * zoom,
    fontWeight: st.bold ? 700 : 400,
    fontStyle: st.italic ? 'italic' : 'normal',
    color: st.color ?? '#000000',
    textAlign: st.align ?? 'left',
    lineHeight: st.lineHeight ?? 1.2,
    background: st.background,
    border: st.borderWidth ? `${Math.max(1, st.borderWidth * zoom)}px solid ${st.borderColor ?? '#000'}` : undefined,
    padding: (st.padding ?? 0) * zoom,
  };
}

function ElementBox({ el, zoom, selected, defaultStyle, onPointerDown, readOnly }: { el: TemplateElement; zoom: number; selected: boolean; defaultStyle?: ElementStyle; onPointerDown: (e: React.PointerEvent, mode: 'move' | 'resize') => void; readOnly: boolean }) {
  const css = styleToCss(el.style, defaultStyle, zoom);
  let body: React.ReactNode = null;
  switch (el.type) {
    case 'text': body = <div className="h-full w-full overflow-hidden whitespace-pre-wrap break-words" style={css}>{el.text}</div>; break;
    case 'pageNumber': body = <div className="h-full w-full overflow-hidden" style={css}>{el.text}</div>; break;
    case 'image': body = <div className="flex h-full w-full items-center justify-center border border-dashed border-border text-[10px] text-fg-subtle" style={{ background: css.background }}><ImageIcon className="mr-1 h-3 w-3" />{el.src === 'organization.logo' ? 'Logo' : 'Image'}</div>; break;
    case 'line': body = <div className="h-full w-full" style={{ background: el.style?.borderColor ?? '#000' }} />; break;
    case 'rect': body = <div className="h-full w-full" style={{ ...css, border: css.border ?? '1px solid #000' }} />; break;
    case 'barcode': body = <div className="flex h-full w-full flex-col items-center justify-center overflow-hidden bg-[repeating-linear-gradient(90deg,#000_0,#000_2px,#fff_2px,#fff_4px)] text-[8px]"><span className="bg-white px-1">{el.value}</span></div>; break;
    case 'qrcode': body = <div className="flex h-full w-full items-center justify-center border border-border text-[9px] text-fg-subtle"><QrCode className="h-1/2 w-1/2" /></div>; break;
    case 'signature': body = <div className="flex h-full w-full flex-col justify-end border-t border-black text-center" style={css}>{el.label}</div>; break;
    case 'table': {
      const cols = el.columns.filter((c) => c.visible);
      const total = cols.reduce((s, c) => s + c.width, 0) || 1;
      body = (
        <table className="w-full border-collapse" style={{ fontSize: (el.style?.fontSize ?? defaultStyle?.fontSize ?? 8) * zoom }}>
          <thead><tr>{cols.map((c) => <th key={c.key} className="border border-border bg-surface-subtle px-1 text-left font-semibold" style={{ width: `${(c.width / total) * 100}%`, textAlign: c.align, ...(el.headerStyle?.background ? { background: el.headerStyle.background } : {}) }}>{c.label}</th>)}</tr></thead>
          <tbody>{[0, 1].map((r) => <tr key={r} className={el.zebra && r % 2 ? 'bg-surface-muted' : ''}>{cols.map((c) => <td key={c.key} className="border border-border px-1 text-fg-subtle" style={{ textAlign: c.align, height: el.rowHeight * zoom }}>{c.format === 'index' ? r + 1 : c.format === 'money' ? '0.00' : `{${c.key}}`}</td>)}</tr>)}</tbody>
        </table>
      );
      break;
    }
  }
  return (
    <div
      className={cn('absolute select-none', !readOnly && 'cursor-move', selected ? 'outline outline-2 outline-primary-500' : 'hover:outline hover:outline-1 hover:outline-primary-300')}
      style={{ left: el.x * zoom, top: el.y * zoom, width: el.width * zoom, height: el.height * zoom, opacity: el.visibleWhen ? 0.85 : 1 }}
      onPointerDown={(e) => onPointerDown(e, 'move')}
      title={el.visibleWhen ? `Visible when ${el.visibleWhen}` : undefined}
    >
      {body}
      {el.locked ? <Lock className="absolute -right-2 -top-2 h-3 w-3 rounded bg-white text-fg-subtle" /> : null}
      {selected && !readOnly ? <div className="absolute -bottom-1 -right-1 h-3 w-3 cursor-se-resize rounded-sm bg-primary-600" onPointerDown={(e) => onPointerDown(e, 'resize')} /> : null}
    </div>
  );
}

function NumberField({ label, value, onChange, step = 1, min, disabled }: { label: string; value: number | undefined; onChange: (v: number) => void; step?: number; min?: number; disabled?: boolean }) {
  return (
    <label className="block text-[11px] text-fg-subtle">{label}<Input type="number" step={step} min={min} className="mt-0.5 h-7 px-2 text-[12px]" value={value ?? ''} onChange={(e) => onChange(Number(e.target.value))} disabled={disabled} /></label>
  );
}

function StyleEditor({ style, onChange, readOnly, compact }: { style: ElementStyle | undefined; onChange: (s: ElementStyle) => void; readOnly: boolean; compact?: boolean }) {
  const s = style ?? {};
  const set = (p: Partial<ElementStyle>) => onChange({ ...s, ...p });
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[11px] text-fg-subtle">Font<Select className="mt-0.5 h-7 px-2 text-[12px]" value={s.fontFamily ?? ''} onChange={(e) => set({ fontFamily: (e.target.value || undefined) as ElementStyle['fontFamily'] })} disabled={readOnly}><option value="">Default</option>{FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}</Select></label>
        <NumberField label="Size (pt)" value={s.fontSize} onChange={(v) => set({ fontSize: v })} step={0.5} min={4} disabled={readOnly} />
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[12px]">
        <label className="flex items-center gap-1"><Checkbox checked={!!s.bold} onChange={(e) => set({ bold: e.target.checked })} disabled={readOnly} /> Bold</label>
        <label className="flex items-center gap-1"><Checkbox checked={!!s.italic} onChange={(e) => set({ italic: e.target.checked })} disabled={readOnly} /> Italic</label>
        <Select className="h-7 w-24 px-2 text-[12px]" value={s.align ?? 'left'} onChange={(e) => set({ align: e.target.value as ElementStyle['align'] })} disabled={readOnly}><option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option></Select>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="block text-[11px] text-fg-subtle">Colour<Input type="color" className="mt-0.5 h-7 w-full p-0.5" value={s.color ?? '#000000'} onChange={(e) => set({ color: e.target.value })} disabled={readOnly} /></label>
        <label className="block text-[11px] text-fg-subtle">Fill<Input type="color" className="mt-0.5 h-7 w-full p-0.5" value={s.background ?? '#ffffff'} onChange={(e) => set({ background: e.target.value })} disabled={readOnly} /></label>
        <label className="block text-[11px] text-fg-subtle">Border<Input type="color" className="mt-0.5 h-7 w-full p-0.5" value={s.borderColor ?? '#000000'} onChange={(e) => set({ borderColor: e.target.value })} disabled={readOnly} /></label>
      </div>
      {!compact ? (
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="Border (pt)" value={s.borderWidth} onChange={(v) => set({ borderWidth: v })} step={0.5} min={0} disabled={readOnly} />
          <NumberField label="Padding" value={s.padding} onChange={(v) => set({ padding: v })} min={0} disabled={readOnly} />
          <NumberField label="Line height" value={s.lineHeight} onChange={(v) => set({ lineHeight: v })} step={0.1} min={0.8} disabled={readOnly} />
        </div>
      ) : null}
      {s.background ? <button type="button" className="text-[11px] text-primary-700 hover:underline" onClick={() => set({ background: undefined })} disabled={readOnly}>Clear fill</button> : null}
    </div>
  );
}

function ElementProps({ el, onChange, onRemove, onDuplicate, onReorder, catalogue, readOnly }: { el: TemplateElement; onChange: (p: Partial<TemplateElement>) => void; onRemove: () => void; onDuplicate: () => void; onReorder: (d: -1 | 1) => void; catalogue: TemplateCatalogue; readOnly: boolean }) {
  const set = (p: Record<string, unknown>) => onChange(p as Partial<TemplateElement>);
  return (
    <div className="space-y-3 text-[13px]">
      <div className="flex items-center justify-between">
        <span className="font-medium capitalize">{el.type}</span>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" aria-label="Send backward" onClick={() => onReorder(-1)} disabled={readOnly}><ArrowDown className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon-sm" aria-label="Bring forward" onClick={() => onReorder(1)} disabled={readOnly}><ArrowUp className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon-sm" aria-label={el.locked ? 'Unlock' : 'Lock'} onClick={() => set({ locked: !el.locked })} disabled={readOnly}>{el.locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}</Button>
          <Button variant="ghost" size="icon-sm" aria-label="Duplicate" onClick={onDuplicate} disabled={readOnly}><Copy className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={onRemove} disabled={readOnly}><Trash2 className="h-3.5 w-3.5 text-danger-600" /></Button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <NumberField label="X" value={el.x} onChange={(v) => set({ x: Math.max(0, v) })} disabled={readOnly} />
        <NumberField label="Y" value={el.y} onChange={(v) => set({ y: Math.max(0, v) })} disabled={readOnly} />
        <NumberField label="W" value={el.width} onChange={(v) => set({ width: Math.max(1, v) })} disabled={readOnly} />
        <NumberField label="H" value={el.height} onChange={(v) => set({ height: Math.max(1, v) })} disabled={readOnly} />
      </div>

      {el.type === 'text' ? <label className="block text-[11px] text-fg-subtle">Text <span className="text-fg-faint">— use {'{{field}}'} for data</span><Textarea className="mt-0.5 min-h-[80px] text-[12px]" value={el.text} onChange={(e) => set({ text: e.target.value })} disabled={readOnly} /></label> : null}
      {el.type === 'pageNumber' ? <label className="block text-[11px] text-fg-subtle">Text<Input className="mt-0.5 h-7 text-[12px]" value={el.text} onChange={(e) => set({ text: e.target.value })} disabled={readOnly} /></label> : null}
      {el.type === 'signature' ? <label className="block text-[11px] text-fg-subtle">Label<Input className="mt-0.5 h-7 text-[12px]" value={el.label} onChange={(e) => set({ label: e.target.value })} disabled={readOnly} /></label> : null}
      {el.type === 'image' ? (
        <div className="space-y-2">
          <label className="block text-[11px] text-fg-subtle">Source<Select className="mt-0.5 h-7 text-[12px]" value={el.src} onChange={(e) => set({ src: e.target.value })} disabled={readOnly}><option value="organization.logo">Organization logo</option><option value="custom">Custom URL</option></Select></label>
          {el.src === 'custom' ? <label className="block text-[11px] text-fg-subtle">Image URL<Input className="mt-0.5 h-7 text-[12px]" value={el.url ?? ''} onChange={(e) => set({ url: e.target.value || undefined })} disabled={readOnly} /></label> : null}
          <label className="block text-[11px] text-fg-subtle">Fit<Select className="mt-0.5 h-7 text-[12px]" value={el.fit} onChange={(e) => set({ fit: e.target.value })} disabled={readOnly}><option value="contain">Contain</option><option value="cover">Cover</option></Select></label>
        </div>
      ) : null}
      {el.type === 'line' ? <label className="block text-[11px] text-fg-subtle">Orientation<Select className="mt-0.5 h-7 text-[12px]" value={el.orientation} onChange={(e) => set({ orientation: e.target.value })} disabled={readOnly}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></Select></label> : null}
      {el.type === 'barcode' ? (
        <div className="space-y-2">
          <label className="block text-[11px] text-fg-subtle">Value<Input className="mt-0.5 h-7 text-[12px]" value={el.value} onChange={(e) => set({ value: e.target.value })} disabled={readOnly} /></label>
          <div className="flex items-center gap-3"><Select className="h-7 w-28 text-[12px]" value={el.symbology} onChange={(e) => set({ symbology: e.target.value })} disabled={readOnly}><option value="code128">Code 128</option><option value="ean13">EAN-13</option></Select><label className="flex items-center gap-1 text-[12px]"><Checkbox checked={el.showText} onChange={(e) => set({ showText: e.target.checked })} disabled={readOnly} /> Show text</label></div>
        </div>
      ) : null}
      {el.type === 'qrcode' ? <label className="block text-[11px] text-fg-subtle">Value<Input className="mt-0.5 h-7 text-[12px]" value={el.value} onChange={(e) => set({ value: e.target.value })} disabled={readOnly} /></label> : null}
      {el.type === 'table' ? <TableProps el={el} set={set} catalogue={catalogue} readOnly={readOnly} /> : null}

      <details open={el.type !== 'table'}>
        <summary className="cursor-pointer text-[12px] font-medium">Style</summary>
        <div className="mt-2"><StyleEditor style={el.style} onChange={(s) => set({ style: s })} readOnly={readOnly} /></div>
      </details>
      <label className="block text-[11px] text-fg-subtle">Only show when field has a value<Input className="mt-0.5 h-7 font-mono text-[12px]" placeholder="e.g. customer.gstin" value={el.visibleWhen ?? ''} onChange={(e) => set({ visibleWhen: e.target.value || undefined })} disabled={readOnly} /></label>
    </div>
  );
}

function TableProps({ el, set, catalogue, readOnly }: { el: Extract<TemplateElement, { type: 'table' }>; set: (p: Record<string, unknown>) => void; catalogue: TemplateCatalogue; readOnly: boolean }) {
  const available = catalogue.tableColumns[el.collection] ?? [];
  const setCol = (i: number, p: Partial<(typeof el.columns)[number]>) => set({ columns: el.columns.map((c, j) => (j === i ? { ...c, ...p } : c)) });
  return (
    <div className="space-y-2">
      <label className="block text-[11px] text-fg-subtle">Rows from<Select className="mt-0.5 h-7 text-[12px]" value={el.collection} onChange={(e) => set({ collection: e.target.value, columns: (catalogue.tableColumns[e.target.value] ?? []).slice(0, 5).map((c, i) => ({ key: c.key, label: c.label, width: 20, align: i === 0 ? 'left' : 'right', format: ['money', 'qty', 'date', 'percent', 'index'].includes(c.format) ? c.format : 'text', visible: true })) })} disabled={readOnly}>{Object.keys(catalogue.tableColumns).map((k) => <option key={k} value={k}>{k}</option>)}</Select></label>
      <div className="text-[11px] text-fg-subtle">Columns (width = relative share)</div>
      <div className="space-y-1">
        {el.columns.map((c, i) => (
          <div key={`${c.key}-${i}`} className="grid grid-cols-[16px_1fr_44px_56px_24px] items-center gap-1">
            <Checkbox checked={c.visible} onChange={(e) => setCol(i, { visible: e.target.checked })} disabled={readOnly} />
            <Input className="h-6 px-1 text-[11px]" value={c.label} onChange={(e) => setCol(i, { label: e.target.value })} disabled={readOnly} aria-label="Column label" />
            <Input type="number" className="h-6 px-1 text-[11px]" value={c.width} onChange={(e) => setCol(i, { width: Math.max(4, Number(e.target.value) || 4) })} disabled={readOnly} aria-label="Width" />
            <Select className="h-6 px-1 text-[11px]" value={c.align} onChange={(e) => setCol(i, { align: e.target.value as 'left' | 'center' | 'right' })} disabled={readOnly}><option value="left">L</option><option value="center">C</option><option value="right">R</option></Select>
            <button type="button" aria-label="Remove column" className="text-fg-faint hover:text-danger-600" disabled={readOnly} onClick={() => set({ columns: el.columns.filter((_, j) => j !== i) })}><Trash2 className="h-3 w-3" /></button>
          </div>
        ))}
      </div>
      <Select className="h-7 text-[12px]" value="" onChange={(e) => { const c = available.find((x) => x.key === e.target.value); if (c) set({ columns: [...el.columns, { key: c.key, label: c.label, width: 15, align: c.format === 'money' || c.format === 'qty' ? 'right' : 'left', format: ['money', 'qty', 'date', 'percent', 'index'].includes(c.format) ? c.format : 'text', visible: true }] }); }} disabled={readOnly} aria-label="Add column">
        <option value="">+ Add column…</option>
        {available.filter((a) => !el.columns.some((c) => c.key === a.key)).map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
      </Select>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Row height" value={el.rowHeight} onChange={(v) => set({ rowHeight: Math.max(8, v) })} min={8} disabled={readOnly} />
        <div className="flex flex-col justify-end gap-1 text-[12px]"><label className="flex items-center gap-1"><Checkbox checked={el.zebra} onChange={(e) => set({ zebra: e.target.checked })} disabled={readOnly} /> Zebra rows</label><label className="flex items-center gap-1"><Checkbox checked={el.grow} onChange={(e) => set({ grow: e.target.checked })} disabled={readOnly} /> Flow to next page</label></div>
      </div>
      <details><summary className="cursor-pointer text-[12px] font-medium">Header style</summary><div className="mt-2"><StyleEditor style={el.headerStyle} onChange={(s) => set({ headerStyle: s })} readOnly={readOnly} compact /></div></details>
    </div>
  );
}

function PageProps({ layout, onChange, readOnly, documentType }: { layout: TemplateLayout; onChange: (l: TemplateLayout) => void; readOnly: boolean; documentType: DocumentTemplateType }) {
  const set = (p: Partial<TemplateLayout>) => onChange({ ...layout, ...p });
  const setMargin = (k: keyof TemplateLayout['margins'], v: number) => set({ margins: { ...layout.margins, [k]: Math.max(0, v) } });
  return (
    <div className="space-y-3 text-[13px]">
      <label className="block text-[11px] text-fg-subtle">Page size<Select className="mt-0.5 h-7 text-[12px]" value={layout.pageSize} onChange={(e) => set({ pageSize: e.target.value as TemplateLayout['pageSize'] })} disabled={readOnly}>{PAGE_SIZES.map((p) => <option key={p} value={p}>{p}{PAGE_DIMENSIONS[p].continuous ? ' (continuous)' : ''}</option>)}</Select></label>
      <label className="block text-[11px] text-fg-subtle">Orientation<Select className="mt-0.5 h-7 text-[12px]" value={layout.orientation} onChange={(e) => set({ orientation: e.target.value as TemplateLayout['orientation'] })} disabled={readOnly}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></Select></label>
      <div className="grid grid-cols-4 gap-2">
        <NumberField label="Top" value={layout.margins.top} onChange={(v) => setMargin('top', v)} min={0} disabled={readOnly} />
        <NumberField label="Right" value={layout.margins.right} onChange={(v) => setMargin('right', v)} min={0} disabled={readOnly} />
        <NumberField label="Bottom" value={layout.margins.bottom} onChange={(v) => setMargin('bottom', v)} min={0} disabled={readOnly} />
        <NumberField label="Left" value={layout.margins.left} onChange={(v) => setMargin('left', v)} min={0} disabled={readOnly} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Header band (pt)" value={layout.headerHeight} onChange={(v) => set({ headerHeight: Math.max(0, v) })} min={0} disabled={readOnly} />
        <NumberField label="Footer band (pt)" value={layout.footerHeight} onChange={(v) => set({ footerHeight: Math.max(0, v) })} min={0} disabled={readOnly} />
      </div>
      <p className="text-[11px] text-fg-subtle">Elements inside the header/footer bands repeat on every page; tables flow between them. Document type: {documentType}.</p>
      <details open><summary className="cursor-pointer text-[12px] font-medium">Default text style</summary><div className="mt-2"><StyleEditor style={layout.defaultStyle} onChange={(s) => set({ defaultStyle: s })} readOnly={readOnly} /></div></details>
      <Button variant="ghost" size="sm" onClick={() => toast.info('Tip: hold Shift while pressing arrow keys to nudge by 10 pt; Ctrl+D duplicates.')}>Keyboard tips</Button>
    </div>
  );
}
