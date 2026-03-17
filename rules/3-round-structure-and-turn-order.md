---
title: Round Structure and Turn Order
section: 3
references:
  - /Users/christofferandersen/Documents/2. Projects/23. App Devolopment/TCG Rules/GLOSSARY.md
  - /Users/christofferandersen/Documents/2. Projects/23. App Devolopment/TCG Rules/CONVENTIONS.md
  - /Users/christofferandersen/Documents/2. Projects/23. App Devolopment/TCG Rules/CHANGELOG.md
---

# 3. Round Structure and Turn Order

Use this section to determine who acts now and when a round ends.

## 3.1 Rounds

Play proceeds in rounds.
In each round, each ready hero can take at most one turn.
A round continues until no ready hero can take another turn.

> **What This Means:** A round is the complete cycle in which every available hero gets one chance to act, including heroes that are waiting to deploy.

## 3.2 Who Can Act

The game uses hero turns, not player turns.
A ready hero can take a turn whether or not that hero is deployed.
After a hero completes its turn, that hero becomes exhausted and cannot take another turn in the same round.

## 3.3 Agility Order

Determine the next acting hero in this order:
1. Compare the agility of all ready heroes.
2. The highest agility acts first.
3. If both players have a highest-agility hero with the same agility, roll a die.
4. The die roll decides which player acts first at that agility.
5. When it is your turn to act at that agility, choose one of your ready heroes with that agility.
6. After one player takes a turn with a hero at that agility, the other player acts next with a hero at that agility if able.
7. Keep alternating until all ready heroes at that agility are exhausted.
8. Then continue with the next lower agility.

> **Example:** If both players have a hero with 5 agility, roll a die to decide which player takes the first 5-agility turn.

> **What This Means:** agility controls sequencing among all available heroes, not only the ones already on the board.

## 3.4 End of Round

The round ends when all ready heroes are exhausted or otherwise unable to take a turn.
When the round ends, reduce each death timer by 1.
Do not reduce a death timer below 0.
When the round ends, each hero with a death timer of 0 becomes ready.
A hero with an active death timer is not ready.

> **Example:** If a hero has a death timer of 2 at the end of the round, that hero has a death timer of 1 after round-end effects resolve.

> **What This Means:** Round end refreshes available heroes for the next cycle and advances defeated heroes toward returning.
