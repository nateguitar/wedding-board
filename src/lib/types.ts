// Shared domain types for the wedding board.

export type Profile = {
  id: string;
  display_name: string;
  email: string;
};

export type Board = {
  id: string;
  title: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type Upload = {
  id: string;
  board_id: string;
  shape_id: string;
  storage_path: string;
  file_type: string;
  original_filename: string;
  status: string;
  created_by: string;
  created_at: string;
};

export type Rating = {
  id: string;
  board_id: string;
  shape_id: string;
  user_id: string;
  rating: number;
  created_at: string;
  updated_at: string;
};

export type Comment = {
  id: string;
  board_id: string;
  shape_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

export type Link = {
  id: string;
  board_id: string;
  shape_id: string;
  url: string;
  title: string;
  description: string;
  image_url: string;
  site_name: string;
  status: string;
  created_by: string;
  created_at: string;
};

export type Reaction = {
  id: string;
  board_id: string;
  shape_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

export type Todo = {
  id: string;
  board_id: string;
  body: string;
  done: boolean;
  created_by: string;
  created_at: string;
};

export type BoardSnapshot = {
  board_id: string;
  snapshot_json: unknown;
  updated_at: string;
};

// A review record assembled in the client for the inspector panel.
export type CardReview = {
  shapeId: string;
  upload?: Upload;
  ratings: Rating[];
  comments: Comment[];
};
