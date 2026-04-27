type Props = {
  children: React.ReactNode;
};

export default function ModuleContainer({ children }: Props) {
  return <div className="px-8 py-6">{children}</div>;
}