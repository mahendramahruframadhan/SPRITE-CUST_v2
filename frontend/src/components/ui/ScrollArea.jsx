import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area';
import { cn } from '../../lib/cn.js';

// ScrollArea — port shadcn (base-nova) ke JSX, disesuaikan repo ini:
// viewport dengan scrollbar native disembunyikan + thumb pill custom yang
// hanya muncul saat konten overflow (perilaku Base UI). Dipakai untuk area
// scroll utama (modal, drawer, panel, sidebar); spot kecil tetap .scrollbar-thin.
//
// Layout: Root (className di sini) harus punya batas tinggi (h-full, max-h-*
// atau flex-1 + min-h-0 di induknya) supaya viewport bisa scroll.
export function ScrollArea({ className, children, horizontal = false, viewportRef, ...props }) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn('relative', className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        ref={viewportRef}
        data-slot="scroll-area-viewport"
        className="size-full rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      {horizontal && <ScrollBar orientation="horizontal" />}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

export function ScrollBar({ className, orientation = 'vertical', ...props }) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        'flex touch-none p-px transition-colors select-none',
        'data-[orientation=horizontal]:h-2.5 data-[orientation=horizontal]:flex-col data-[orientation=horizontal]:border-t data-[orientation=horizontal]:border-t-transparent',
        'data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2.5 data-[orientation=vertical]:border-l data-[orientation=vertical]:border-l-transparent',
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-slate-300 hover:bg-slate-400 dark:bg-slate-600 dark:hover:bg-slate-500"
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}

export default ScrollArea;
