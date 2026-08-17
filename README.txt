Server Names v1.3

Defaults:
- Width: 112 px
- Height: 24 px
- Font size: 10 px
- Icon size: 20 px
- Vertical padding: 4 px

Key v1.3 changes:
- Patches the guild FastList itemSize to visible height + 2x padding.
- Widens the guild FastList itself.
- Widens GuildsOnly when created.
- Widens NavigationContent and its render-prop root where possible.
- Retains the proven GuildsBarGuild.type visual row patch.
- Settings remain persistent.

IMPORTANT: Fully reload Discord after installation or any dimension change so
FastList rebuilds its recycler geometry with the new item size.
