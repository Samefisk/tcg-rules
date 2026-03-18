---
title: Hero Turn Procedure
section: 4
references:
  - /Users/christofferandersen/Documents/2. Projects/23. App Devolopment/TCG Rules/GLOSSARY.md
  - /Users/christofferandersen/Documents/2. Projects/23. App Devolopment/TCG Rules/CONVENTIONS.md
  - /Users/christofferandersen/Documents/2. Projects/23. App Devolopment/TCG Rules/CHANGELOG.md
---

# 4. Hero Turn Procedure

Once a hero is chosen to act, resolve its turn using this section.

## 4.1 Turn Outline

Resolve a hero's turn in this order:
1. If you deploy that hero, resolve §4.2.
2. Resolve §4.3.
3. Resolve actions by following §4.4.
4. Resolve §4.9.

> **What This Means:** The outer shape of a turn is fixed even though the action portion inside it is flexible.

## 4.2 Deployment

When your acting hero deploys, place that hero in the middle column on the row closest to your side of the arena.
A hero with an active death timer cannot deploy.
When your acting hero deploys, draw until your wisdom (max hand size) is reached.

## 4.3 Intellect Draw

Pick up your acting hero's pitched cards.
Then draw cards equal to that hero's intellect.
Do not draw above your wisdom (max hand size).

> **Example:** If your hero has 2 intellect and 2 cards in its hand, draw 1 card if your wisdom (max hand size) is 3.

## 4.4 Action Window

After deployment and any draw, your acting hero enters its action window.
During this action window, that hero may:
- Move once.
- Perform one innate attack or attune once.
- Play any number of legal skills.
You may perform these actions in any order.

> **What This Means:** This is the flexible part of the turn. You build the sequence, but movement is limited, innate attack and attune are mutually exclusive, and each skill must still be legal.

## 4.5 Agility Move

Your acting hero may move only once during its turn.
To move, declare a total movement distance up to that hero's agility.
To pay for that movement, pitch 1 card from that hero's hand for each tile in the declared movement.
Then move that hero by following §5.
**Movement Restriction:** You cannot move, resolve another action, and then move again in the same turn.

> **Example:** If your hero has 3 agility, you may pitch 3 cards to move that hero 3 tiles in one movement sequence.

> **What This Means:** Movement is committed as one package. You choose the size first, pay for the whole path, and then carry it out.

## 4.6 Innate Attack and Attune

During its turn, your acting hero may perform its innate attack or attune, but not both.
Innate attack: [[summary:innate-attack]]
If that innate attack has focus, resolve it by following §4.8.
To attune, select 1 or more cards from that hero's hand.
Select no more cards than that hero's intellect.
Attach the selected cards to that hero as attuned cards.

> **Example:** If your hero has 3 intellect, you may select 1, 2, or 3 cards from that hero's hand and attune those cards with that one attune action.

> **What This Means:** This choice is binary. You use the printed innate attack now, or you use your one attune action now. That attune action may attach multiple cards.

## 4.7 Play Skills

Your acting hero may play a skill from its hand during its turn.
Your acting hero may play any number of legal skills during that turn.
A skill is legal only if all of the following are true:
- That skill's talent matches a talent on that hero or on one of that hero's attuned cards.
- That hero has attunement equal to or greater than that skill's numeric attunement requirement.
- If that skill has focus, that hero resolves it by following §4.8.
- If that skill lists a cost, you pay that cost.
- If that skill requires targets, all required targets are in range before you play it.
Resolve that skill by following its text.
After that skill resolves, move that skill to that hero's pitch area unless that card says otherwise.

> **Example:** If a skill has an attunement requirement of 2 and your hero has 1 attunement, you cannot play that skill.

> **What This Means:** The limiting factor on card play is not count. It is whether your hero has enough matching talent, enough attunement, and any required focus for each card.

## 4.8 Focus

An innate attack or skill may have focus.
A focus action can be performed only if that hero has not performed a move action earlier in that turn.
That hero may perform a move action later in the same turn.

<!-- COMMENT: endpoint-test -->

> **What This Means:** focus requires the action to happen before movement, not after it. As a rule of thumb, ranged innate attacks usually have focus and melee innate attacks usually do not.

## 4.9 End of Turn Cleanup

At the end of your acting hero's turn, pitch all unused cards from that hero's hand.
After end-of-turn cleanup, that hero has no cards in its hand unless another rule says otherwise.

> **What This Means:** Cards do not linger in hand between turns. Unused cards become part of the next start-of-turn loop instead.
