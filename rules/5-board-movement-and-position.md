---
title: Board, Movement, and Position
section: 5
references:
  - /Users/christofferandersen/Documents/2. Projects/23. App Devolopment/TCG Rules/GLOSSARY.md
  - /Users/christofferandersen/Documents/2. Projects/23. App Devolopment/TCG Rules/CONVENTIONS.md
  - /Users/christofferandersen/Documents/2. Projects/23. App Devolopment/TCG Rules/CHANGELOG.md
---

# 5. Board, Movement, and Position

This section explains how heroes occupy the board and how position changes.

## 5.1 Occupancy

Each hero is an obstruction.
An obstruction cannot be moved through unless an effect says otherwise.
A tile can contain only one obstruction at a time.
**Occupancy Restriction:** No rule can allow two obstructions to occupy the same tile at the same time.

> **What This Means:** The board always has one-body-per-space positioning, even when an effect changes how movement works.

## 5.2 Legal Movement Paths

When a hero moves, that movement must be a path of adjacent tiles.
Each step in that path must move directly north, south, east, or west.
A hero cannot move diagonally.
A hero cannot move through another obstruction unless an effect says otherwise.
A hero cannot move onto a tile that contains another obstruction.
A movement path may never end with two obstructions on the same tile.

> **Example:** If the tile east of your hero contains another hero, your hero cannot move east unless an effect says otherwise.

> **What This Means:** Paths are orthogonal and physically constrained. Effects can bend pathing, but they cannot break occupancy.

## 5.3 Arcane Item Pickup

If your hero lands on a tile with an arcane item, that hero equips that arcane item.
That pickup is immediate and mandatory.
Remove that arcane item from that tile when that hero equips it.

> **Example:** If your hero ends its movement on a corner tile with an arcane item, that hero equips that arcane item immediately.

> **What This Means:** Entering an objective tile automatically converts board position into objective progress.

## 5.4 Knockback

When a hero takes physical damage, resolve knockback in this order:
1. Calculate the damaged hero's available strength.
2. Calculate the knockback threshold: 2 x that hero's available strength.
3. If that damage is less than the threshold, stop. No knockback occurs.
4. Determine the direction of the attack from the attacking source toward the damaged hero.
5. Move that hero one tile in that direction if that destination tile is legal.
6. If that hero has one or more equipped arcane items, that hero is disarmed. That hero's controller chooses one equipped arcane item.
7. If that hero moved, drop the chosen arcane item on the tile that hero moved from.
8. If that hero did not move, drop the chosen arcane item on the tile opposite the direction of the attack if that drop is legal.
9. If no legal drop tile exists, the chosen arcane item is not dropped.
A hero without an equipped arcane item can still be knocked back.

> **Example:** If a hero has 3 strength and 1 equipped arcane item, that hero's available strength is 2, so that hero is knocked back by physical damage of 4 or more.

> **What This Means:** knockback can change both position and objective control. A strong hit can push a hero off a key tile and disarm that hero at the same time.

## 5.5 Targeting and Range

Adjacent means a tile one step north, south, east, or west from another tile.
Adjacent does not include diagonal tiles.
The targets of an innate attack depend on that innate attack.
The range of an innate attack depends on that innate attack.
The targets of a skill depend on that skill.
The range of a skill depends on that skill.

<!-- AMBIGUOUS: A later combat section should define line of sight and other shared targeting rules beyond Adjacent. -->
