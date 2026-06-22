# Mousey Snake Hip Hop motion capture

`mousey-snake-hip-hop.glb` and `mousey-samba-dancing.glb` were converted from
the Mixamo FBX files supplied for this project. The Samba file contains only
the animation and skeleton hierarchy, so it reuses the Mousey mesh at runtime.
The original embedded textures were removed because the winning scene applies
its own floral material and cat head.

The remaining skinned mesh, skeleton, and animation are stored as binary glTF
with Meshopt compression. It is loaded through the vendored Three.js
`GLTFLoader` and `MeshoptDecoder`.
