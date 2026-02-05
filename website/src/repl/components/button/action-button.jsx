import cx from '@src/cx.mjs';

export function ActionButton({ children, label, labelIsHidden, className, ...buttonProps }) {
  return (
    <button className={cx('hover:opacity-50 text-xs text-nowrap w-fit', className)} title={label} {...buttonProps}>
      {labelIsHidden !== true && label}
      {children}
    </button>
  );
}

export function SpecialActionButton(props) {
  const { className, ...buttonProps } = props;

  return (
    <ActionButton {...buttonProps} className={cx('bg-background p-2 max-w-[300px] hover:opacity-50', className)} />
  );
}

export function IconButton(props) {
  const { Icon, label, children, labelIsHidden, className, ...buttonProps } = props;

  return (
    <button
      className={cx('space-x-1 max-w-[300px] inline-flex items-center cursor-pointer hover:opacity-50', className)}
      title={label}
      {...buttonProps}
    >
      <Icon className="w-5 h-5" />
      <span className="max-w-[300px]">{label}</span>
      {children}
    </button>
  );
}

export function ActionInput({ label, className, ...props }) {
  return (
    <label className={cx('space-x-1 inline-flex items-center cursor-pointer ', className)}>
      <input {...props} className="sr-only peer" />
      <span className="inline-flex items-center peer-hover:opacity-50 text-xs">{label}</span>
    </label>
  );
}

export function SpecialActionInput({ className, ...props }) {
  return <ActionInput {...props} className={className} label={<span className="max-w-[300px]">{props.label}</span>} />;
}
