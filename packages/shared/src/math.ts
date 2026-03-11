export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Ray {
  origin: Vec3;
  direction: Vec3;
}

export interface AABB {
  min: Vec3;
  max: Vec3;
}
