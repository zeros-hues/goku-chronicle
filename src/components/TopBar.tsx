'use client';

interface TopBarProps {
  title: string;
  titleAccent?: boolean;
  sub?: string;
  left?: React.ReactNode;
  actions?: React.ReactNode;
}

export default function TopBar({ title, titleAccent = true, sub, left, actions }: TopBarProps) {
  return (
    <div className="top-bar">
      <div className="top-bar-left">
        <div>
          <h1>
            {title}
            {titleAccent && <span className="accent">.</span>}
          </h1>
          {sub && <span className="sub">{sub}</span>}
        </div>
        {left}
      </div>
      {actions && <div className="top-bar-actions">{actions}</div>}
    </div>
  );
}
