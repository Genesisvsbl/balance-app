type Props = {
  children: React.ReactNode;
};

export default function ModuleContainer({ children }: Props) {
  return <div className="px-4 py-3">{children}</div>;
}
