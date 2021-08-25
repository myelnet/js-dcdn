export type Author = {
  name: string;
  picture: string;
};

export type Post = {
  title: string;
  coverImage: string;
  excerpt: string;
  date: string;
  author: Author;
  slug: string;
  content: string;
};
