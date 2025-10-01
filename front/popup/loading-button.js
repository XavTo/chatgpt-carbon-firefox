const React = window.React;
const ReactDOM = window.ReactDOM;

if (!React || !ReactDOM) {
  throw new Error('React et ReactDOM doivent être chargés avant loading-button.js');
}

const { useImperativeHandle, useRef, forwardRef } = React;

const Spinner = () =>
  React.createElement('span', {
    className: 'loading-indicator',
    role: 'presentation',
    'aria-hidden': 'true',
  });

const LoadingButtonInner = forwardRef(function LoadingButtonInner(
  { id, label, loading, variant = 'primary', disabled = false, onClick },
  ref,
) {
  const buttonRef = useRef(null);

  useImperativeHandle(ref, () => ({
    focus: () => buttonRef.current?.focus(),
    get node() {
      return buttonRef.current;
    },
  }));

  const className = [variant, 'loading-button', loading ? 'is-loading' : null]
    .filter(Boolean)
    .join(' ');

  const handleClick = (event) => {
    if (loading || disabled) {
      event.preventDefault();
      return;
    }
    if (typeof onClick === 'function') {
      onClick(event);
    }
  };

  return React.createElement(
    'button',
    {
      id,
      className,
      disabled: disabled || loading,
      onClick: handleClick,
      ref: buttonRef,
      type: 'button',
    },
    loading ? Spinner() : null,
    React.createElement('span', { className: 'label' }, label),
  );
});

export function createLoadingButton({
  container,
  id,
  label,
  variant,
  disabled = false,
}) {
  if (!container) {
    throw new Error('Conteneur invalide pour le bouton avec chargement');
  }

  const buttonRef = React.createRef();
  const root = ReactDOM.createRoot(container);

  const state = {
    label: label ?? '',
    loading: false,
    variant,
    disabled,
    onClick: null,
  };

  function render() {
    root.render(
      React.createElement(LoadingButtonInner, {
        id,
        label: state.label,
        loading: state.loading,
        variant: state.variant,
        disabled: state.disabled,
        onClick: state.onClick,
        ref: buttonRef,
      }),
    );
  }

  render();

  return {
    setLabel(nextLabel) {
      state.label = nextLabel;
      render();
    },
    setLoading(isLoading) {
      state.loading = Boolean(isLoading);
      render();
    },
    setDisabled(isDisabled) {
      state.disabled = Boolean(isDisabled);
      render();
    },
    setOnClick(handler) {
      state.onClick = handler;
      render();
    },
    getElement() {
      return buttonRef.current;
    },
  };
}
