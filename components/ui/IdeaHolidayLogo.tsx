type IdeaHolidayLogoProps = {
  className?: string;
  showTagline?: boolean;
};

export default function IdeaHolidayLogo({ className = '', showTagline = false }: IdeaHolidayLogoProps) {
  return (
    <span className={`inline-flex flex-col ${className}`} aria-label="idea holiday">
      <span className="inline-flex items-end whitespace-nowrap text-[1em] font-extrabold leading-none tracking-[-0.065em]">
        <span className="relative text-amber-400">
          idea
          <span aria-hidden="true" className="absolute -right-[0.02em] -top-[0.34em] h-[0.32em] w-[0.62em] rounded-t-full bg-amber-400 opacity-90" />
        </span>
        <span className="text-slate-100">holiday</span>
        <span aria-hidden="true" className="ml-[0.12em] mb-[0.08em] h-[0.16em] w-[0.16em] rounded-full bg-emerald-400" />
      </span>
      {showTagline && (
        <span className="mt-1 font-mono text-[0.28em] font-semibold uppercase tracking-[0.28em] text-slate-500">
          journeys made personal
        </span>
      )}
    </span>
  );
}
