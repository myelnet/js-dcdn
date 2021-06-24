export type PageProps = {
  title: string;
  description: string;
  content: string;
  menu: ListItem[][];
  root: string;
};

export type ListItem = {
  title: string;
  slug: string;
};

export type MasterProps = {
  items: ListItem[][];
  pathroot: string;
  open: boolean;
};
