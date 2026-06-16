type Props = {
  children: React.ReactNode;
};

export default function ModuleContainer({ children }: Props) {
  return <div className="px-6 py-4">{children}</div>;
}
