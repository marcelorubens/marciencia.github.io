# Mousey Snake Hip Hop motion capture

`mousey-snake-hip-hop.glb` was converted from the Mixamo FBX supplied for this
project. The original embedded textures were removed because the winning scene
applies its own floral material and cat head.

The remaining skinned mesh, skeleton, and animation are stored as binary glTF
with Meshopt compression. It is loaded through the vendored Three.js
`GLTFLoader` and `MeshoptDecoder`.
