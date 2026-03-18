# Glossary

This file defines canonical game terms.
Do not use a capitalized rules term in `rules/` unless it is defined here.

## Terms

### Agility
Categories: hero-stat
Summary: A stat on a Hero that determines turn order among all Ready Heroes in a Round and sets how far that Hero may move during its Turn.

A stat on a **Hero** that determines turn order among all **Ready** **Heroes** in a **Round**. During that **Hero's** **Turn**, **Agility** also sets the maximum number of **Tiles** that **Hero** may move in its single move action.

### Attunement
The number of cards currently attuned to a **Hero**. **Attunement** is used to check whether that **Hero** meets a **Skill's** numeric **Attunement Requirement**.

### Attunement Requirement
The minimum **Attunement** a **Hero** must have before that **Hero** may legally play a **Skill**. If a **Hero's** **Attunement** is lower than the listed **Attunement Requirement**, that card cannot be played.

### Available Strength
A derived value equal to a **Hero's** **Strength** minus the number of **Arcane Items** that **Hero** has equipped. **Available Strength** is used to calculate that **Hero's** **Knockback** threshold.

### Arcane Field
Categories: card-type

A special objective card placed face down on the center **Tile** of the **Arena** during setup. To win the **Game**, your side must collectively have all 4 **Arcane Items** equipped and one of your **Heroes** must **Occupy** the **Tile** with the **Arcane Field**.

### Arcane Item
Categories: card-type

A special objective card placed face down on each corner **Tile** of the **Arena** during setup. When a **Hero** lands on a **Tile** with an **Arcane Item**, that **Hero** equips it immediately. Equipped **Arcane Items** reduce **Available Strength** and may be dropped through **Disarm** or **Knockback**.

### Attune
To select 1 or more cards from a **Hero's** **Hand** and attach them to that **Hero** as attuned cards. During a **Turn**, a **Hero** may perform its **Innate Attack** or **Attune**, but not both. When a **Hero** **Attunes**, that **Hero** may attach up to a number of cards equal to its **Intellect**. Attuned cards increase that **Hero's** **Attunement** and may also provide matching **Talents**.

### Card
A physical game object represented by a card. **Hero** cards, **Skills**, **Arcane Items**, and the **Arcane Field** are all cards in this ruleset.

### Card Type
Badge: CT

A broad category that identifies what kind of **Card** something is. **Skill** is the currently defined **Card Type** used for playable cards in a **Skill Deck**.

### Cost
Summary: A payment you must make before a Skill resolves.

A payment required to perform an action or play a card. If a **Skill** lists a **Cost**, you must pay that **Cost** before the card resolves.

### Dead
A state showing that a **Hero** has died and is out of play. A **Dead** **Hero** remains in its **Hero Pool Zone**, is not **Ready**, and cannot deploy while its **Death Timer** is greater than 0.

### Damage
A numeric amount dealt by an **Effect**, including **Innate Attacks** and **Skills**. When a **Hero** takes **Damage**, add that amount to its **Taken Damage**. A **Hero** dies when its **Taken Damage** is equal to or greater than its **Max Health**.

### Damage Type
A category that classifies **Damage** and determines whether extra rules apply. The defined **Damage Types** are **Physical Damage**, **Magic Damage**, and **Spirit Damage**.

### Death Timer
A countdown value that keeps a **Hero** out of play after that **Hero** dies. While a **Death Timer** is greater than 0, that **Hero** is **Dead**, is not **Ready**, and cannot deploy. At the end of each **Round**, reduce each **Death Timer** by 1, to a minimum of 0.

### Deployed
A state showing that a **Hero** is on the **Arena** rather than in the **Hero Pool Zone**. A **Hero** that is not **Deployed** may still take a **Turn** if that **Hero** is **Ready**, and may deploy during that turn if allowed.

### Disarm
To make a **Hero** drop an equipped **Arcane Item**. Under the current core rules, **Disarm** occurs during **Knockback** if the damaged **Hero** has one or more equipped **Arcane Items**.

### Disruption
A **Skill Type** used for cards that interfere with an opposing plan, position, or board state. The label classifies the card's role, but the specific behavior is defined by that card's text.

### Disruption Skill
Summary: A Skill focused on disruption rather than Damage.

A **Skill** focused on disruption rather than **Damage**. A **Disruption Skill** deals no **Damage** under the current card-anatomy summary and instead interferes with an opposing plan, position, or board state.

### Draw
To take cards from your **Skill Deck** and place them into a **Hero's** **Hand**. During deployment you draw until your **Wisdom (Max Hand Size)** is reached, and at the start of a **Hero's** **Turn** you draw cards equal to that **Hero's** **Intellect**, without drawing above that limit.

### Equipped
A state in which an **Arcane Item** is attached to a **Hero**. A **Hero** equips an **Arcane Item** immediately upon landing on its **Tile**, and an equipped item remains attached until a rule or **Effect** causes it to be dropped or moved.

### Effect
A game instruction created by a rule or by card text. **Damage**, movement changes, and other outcomes are all resolved through **Effects**. If a **Hero** dies during an **Effect**, finish resolving that **Effect** before applying death resolution.

### Effect Text
Summary: The printed text area on a card that tells you what that card does.

The printed text area on a card that tells you what that card does. On a **Hero** card, **Effect Text** may include that **Hero's** **Innate Attack** and other printed effects. On a **Skill**, **Effect Text** defines what happens when that card resolves.

### Focus
Summary: A requirement that only allows an action before you move that Turn.

A requirement that may appear on an **Innate Attack** or a **Skill**. A **Focus** action can be performed only if the acting **Hero** has not performed a move action earlier in that **Turn**. The **Hero** may still move later in the same **Turn** if another rule allows it.

### Exhausted
A state showing that a **Hero** has already acted, or otherwise cannot act again, in the current **Round**. After a **Hero** completes its **Turn**, that **Hero** becomes **Exhausted** until the next round refreshes eligible **Heroes**.

### Game
A full match played under this ruleset. The current core game uses 2 **Players**, each bringing 3 **Heroes** and 1 **Skill Deck**.

### Global
A **Range Category** that may target anywhere the source **Effect** allows. The exact legal targets still depend on the text of the attack or **Skill** that uses **Global**.

### Hand
A hidden **Zone** that holds the cards currently available to a **Hero**. Cards in **Hand** may be played, **Pitched**, or used to **Attune**. At the end of that **Hero's** **Turn**, all unused cards in its **Hand** are **Pitched** unless another rule says otherwise.

### Wisdom (Max Hand Size)
Categories: hero-stat

The maximum number of cards a **Hero** may hold in its **Hand**. **Wisdom (Max Hand Size)** is 3 by default, is tracked separately rather than printed on **Hero** cards, and may be changed by card effects.

### Health
Badge: HL
Badge Color: #6f8a68

A glossary category term for survivability values on a **Hero**. In player-facing **Rules** text and card effects, use **Max Health** for the total survivability limit and **Remaining Health** for how much more **Damage** a **Hero** can take before dying, rather than using bare **Health**.

### Hero Stat
Badge: HS

A glossary category term used for stats tracked or printed on a **Hero**. Terms that list **Hero Stat** as their category are treated as hero statistics in the generated glossary presentation.

### Hero
Categories: card-type

A unit card that can take **Turns** and act as the active unit for its controller. A **Hero** has printed stats, may deploy to the **Arena**, may move, attack, **Attune**, and play **Skills**, and can die and later return through the **Death Timer** system.

### Hero Pool Zone
An off-board **Zone** that holds your **Heroes** before deployment and after they die. A **Hero** in the **Hero Pool Zone** does not **Occupy** a **Tile**.

### Illustration
Summary: The printed art on a card.

The printed art on a card.

### Intellect
Categories: hero-stat
Summary: A stat on a Hero that sets start-of-turn draw and the maximum cards that Hero may attach in one Attune action.

A stat on a **Hero** that sets how many cards that **Hero** draws at the start of its **Turn**. After picking up that **Hero's** **Pitched Cards**, draw cards equal to its **Intellect**, without drawing above **Wisdom (Max Hand Size)**. **Intellect** also sets the maximum number of cards that **Hero** may attach in a single **Attune** action.

### Innate Attack
Categories: attack
Summary: The printed attack effect on a Hero card that that Hero may perform during its Turn.

The printed attack effect on a **Hero** card that that **Hero** may perform during its **Turn**. During a **Turn**, a **Hero** may perform one **Innate Attack** or one **Attune** action, but not both. The targets, range, and any **Focus** requirement of an **Innate Attack** depend on the specific printed attack.

### Title
Summary: The printed name at the top of a card that identifies that card.

The printed name at the top of a card that identifies that card. **Title** helps you distinguish one card from another during setup and play.

### Kick
A melee cast attack category that may appear on an **Innate Attack** or a **Skill**. The current core rules assign no shared behavior to **Kick** beyond that classification.

### Knockback
A rules process checked whenever a **Hero** takes **Physical Damage**. Calculate the damaged **Hero's** **Available Strength**, double it to get the threshold, and compare the incoming **Damage**. If the **Damage** meets or exceeds that threshold, attempt to move that **Hero** 1 **Tile** away from the attack's source and resolve any resulting **Disarm**.

### Magic Damage
One of the 3 defined **Damage Types**. **Magic Damage** currently has no additional shared rules beyond counting as a distinct **Damage Type**.

### Magic Guard
A reserved keyword intended to prevent or reduce **Magic Damage**. The current core rules do not define a shared procedure for **Magic Guard**, so its behavior exists only if a future rule or card text defines it.

### Max Health
Categories: hero-stat, health
Summary: A stat on a Hero that sets how much Damage that Hero can take before dying.

A stat on a **Hero** that sets how much **Damage** that **Hero** can take before dying. When that **Hero's** **Taken Damage** is equal to or greater than its **Max Health**, that **Hero** dies.

### Remaining Health
Categories: health

The amount of **Damage** a **Hero** can still take before dying. **Remaining Health** is equal to that **Hero's** **Max Health** minus its **Taken Damage**. In player-facing **Rules** text and card effects, use **Remaining Health** when referring to how much survivability a **Hero** has left.

### Melee
A close-range **Range Category** or cast category used on attacks and effects. The current ruleset recognizes **Melee** as a classification, but detailed shared targeting procedures are still reserved for a later combat section.

### Mystical
A defined **Talent** that may appear on a **Hero**, an attuned card, or a **Skill**. **Mystical** has no standalone rules effect beyond talent matching.

### Nature
A defined **Talent** that may appear on a **Hero**, an attuned card, or a **Skill**. **Nature** has no standalone rules effect beyond talent matching.

### Obstruction
An object or unit that blocks movement and enforces one-per-**Tile** occupancy. An **Obstruction** cannot be moved through unless an **Effect** says otherwise, and no rule may allow 2 **Obstructions** to occupy the same **Tile** at the same time. Each **Hero** is an **Obstruction**.

### Occupy
To be on a **Tile** in the **Arena**. A **Hero** in the **Hero Pool Zone** does not **Occupy** a **Tile**.

### Physical Damage
A **Damage Type** that always checks **Knockback** when dealt to a **Hero**. It otherwise follows the normal rules for applying **Damage** and increasing **Taken Damage**.

### Physical Guard
A reserved keyword intended to prevent or reduce **Physical Damage**. The current core rules do not define a shared procedure for **Physical Guard**, so its behavior exists only if a future rule or card text defines it.

### Player
A person participating in the **Game**. Each **Player** controls 3 **Heroes** and 1 **Skill Deck** in the current core format.

### Pitch
To move a card from a **Hero's** **Hand** to that **Hero's** pitch area. You **Pitch** cards to pay for movement, unused cards are **Pitched** at end of turn, and a **Hero** picks up its **Pitched Cards** at the start of its next **Turn**.

### Pitched Card
A card in a **Hero's** pitch area. At the start of that **Hero's** **Turn**, pick up all of its **Pitched Cards** before drawing for **Intellect**.

### Projectile
A reserved keyword intended for attacks or effects that travel across the board. The current core rules do not define a shared procedure for **Projectile**, so its behavior exists only if a future rule or card text defines it.

### Ready
A state showing that a **Hero** is eligible to take a **Turn**. A **Hero** with an active **Death Timer** cannot be **Ready**, and a **Hero** that completes its turn becomes **Exhausted** until the next **Round** refresh.

### Range Category
A broad category that describes the targeting or distance profile of an attack or **Effect**. Defined **Range Categories** in the current glossary include **Melee**, **Ranged**, **Self**, and **Global**.

### Ranged
A long-range **Range Category** or cast category used on attacks and effects. The current ruleset recognizes **Ranged** as a classification, but detailed shared targeting procedures are still reserved for a later combat section.

### Round
The span of play in which each **Ready** **Hero** may take at most one **Turn**. A **Round** ends when no **Ready** **Hero** can take another turn, then **Death Timers** are reduced and all eligible **Heroes** become **Ready** again.

### Rule
An authoritative instruction in the rulebook. A **Rule** defines game procedure unless a more specific rule or card text says otherwise.

### Skill Deck
A 40-card deck a **Player** brings to the **Game**. **Skills** are drawn from this deck, and cards moved out of a dead **Hero's** **Hand** or pitch area are placed on the bottom of that deck.

### Skill
Categories: card-type
Summary: A playable card from a Skill Deck that a Hero may play during its Turn.

A playable **Card** from a **Skill Deck** that a **Hero** may play during its **Turn**. **Skill** is also the currently defined **Card Type** for those playable cards. Every **Skill** has a **Talent** and a numeric **Attunement Requirement**, and it may also have **Focus**, a **Cost**, targeting instructions, range instructions, and **Effect Text**.

### Skill Type
Summary: A category that describes the role of a Skill.

A category that describes the role of a **Skill**. Defined **Skill Types** currently include **Attack**, **Utility**, **Summon**, and **Disruption**.

### Summon
A **Skill Type** used for cards that create or call a unit or object into play. The label classifies the card's role, but the specific behavior is defined by that card's text.

### Strength
Categories: hero-stat
Summary: A stat on a Hero used to calculate Knockback resistance.

A stat on a **Hero** used to calculate **Knockback** resistance. Start with printed **Strength**, subtract the number of equipped **Arcane Items** to get **Available Strength**, then double that value to find the **Knockback** threshold.

### Spirit Guard
A reserved keyword intended to prevent or reduce **Spirit Damage**. The current core rules do not define a shared procedure for **Spirit Guard**, so its behavior exists only if a future rule or card text defines it.

### Talent
Summary: A trait on a Hero, an attuned card, or a Skill used for talent matching.

A trait on a **Hero**, an attuned card, or a **Skill** used for talent matching. A **Hero** may play a **Skill** only if that card's **Talent** matches a **Talent** on the **Hero** or on one of that **Hero's** attuned cards.

### Utility
A **Skill Type** used for cards focused on support, repositioning, or other non-attack outcomes. The label classifies the card's role, but the specific behavior is defined by that card's text.

### Utility Skill
Summary: A Skill focused on beneficial non-Damage outcomes.

A **Skill** focused on beneficial non-**Damage** outcomes. A **Utility Skill** deals no **Damage** under the current card-anatomy summary and instead helps your side through support, repositioning, or another beneficial effect.

### Universal Guard
A reserved keyword intended to prevent or reduce multiple kinds of **Damage**. The current core rules do not define a shared procedure for **Universal Guard**, so its behavior exists only if a future rule or card text defines it.

### Spirit Damage
One of the 3 defined **Damage Types**. **Spirit Damage** currently has no additional shared rules beyond counting as a distinct **Damage Type**.

### Taken Damage
The total **Damage** currently marked on a **Hero**. **Taken Damage** remains on that **Hero** until a rule removes it, and that **Hero** dies when its **Taken Damage** is equal to or greater than its **Max Health**.

### Tile
A single space in the 5x5 **Arena**. Movement is measured in **Tiles**, and each **Tile** may contain at most one **Obstruction**.

### Arena
The 5x5 play area where **Heroes** move and objective cards are placed. The **Arcane Field** begins on the center **Tile**, and the 4 **Arcane Items** begin on the corner **Tiles**.

### Turn
The sequence in which one **Hero** acts as the active unit. A **Turn** follows a fixed outer structure: optional deployment, start-of-turn draw, an action window, and end-of-turn cleanup.

### Zone
A game area that can contain cards or units. Defined zones in the current rules include a **Hero Pool Zone**, a **Hand**, and each **Hero's** pitch area.

### Adjacent
A reserved keyword intended to refer to a neighboring **Tile**. The current core rules define orthogonal movement between adjacent tiles, but do not yet establish a shared targeting definition for **Adjacent** in card text.

### Arc Buff
A ranged cast universal category that may appear on an **Innate Attack** or a **Skill**. The current core rules assign no shared behavior to **Arc Buff** beyond that classification.

### Attack
Badge: AT
Summary: An action that deals Damage.

A glossary category term for actions that deal **Damage**. Terms that list **Attack** as their category are attacks. **Attack** is also a **Skill Type** used for **Skills** that deal **Damage** or otherwise make an offensive action.

### Skill Attack
Categories: attack
Summary: A Skill focused on dealing Damage.

A **Skill** focused on dealing **Damage**. A **Skill Attack** may also include other instructions, but its primary role is offensive.

### Bite
A melee cast attack category that may appear on an **Innate Attack** or a **Skill**. The current core rules assign no shared behavior to **Bite** beyond that classification.

### Call Down
A ranged cast universal category that may appear on an **Innate Attack** or a **Skill**. The current core rules assign no shared behavior to **Call Down** beyond that classification.

### Cardinal
A keyword referring to north, south, east, or west direction. The current movement rules already use cardinal steps between **Tiles**, but shared card-text handling for **Cardinal** remains reserved for future rules.

### Claw
A melee cast attack category that may appear on an **Innate Attack** or a **Skill**. The current core rules assign no shared behavior to **Claw** beyond that classification.

### Conjures
A reserved keyword intended for creating an object, unit, or effect. The current core rules do not define a shared procedure for **Conjures**, so its behavior exists only if a future rule or card text defines it.

### Distant
A reserved keyword intended for longer-range targeting. The current core rules do not define a shared procedure for **Distant**, so its behavior exists only if a future rule or card text defines it.

### Fire
A defined **Talent** that may appear on a **Hero**, an attuned card, or a **Skill**. **Fire** has no standalone rules effect beyond talent matching.

### Gouge
A melee cast attack category that may appear on an **Innate Attack** or a **Skill**. The current core rules assign no shared behavior to **Gouge** beyond that classification.

### Launch
A ranged cast attack category that may appear on an **Innate Attack** or a **Skill**. The current core rules assign no shared behavior to **Launch** beyond that classification.

### Lightning
A defined **Talent** that may appear on a **Hero**, an attuned card, or a **Skill**. **Lightning** has no standalone rules effect beyond talent matching.

### Long-reaching
A reserved keyword intended for extended reach. The current core rules do not define a shared procedure for **Long-reaching**, so its behavior exists only if a future rule or card text defines it.

### Maul
A melee cast attack category that may appear on an **Innate Attack** or a **Skill**. The current core rules assign no shared behavior to **Maul** beyond that classification.

### Punch
A melee cast attack category that may appear on an **Innate Attack** or a **Skill**. The current core rules assign no shared behavior to **Punch** beyond that classification.

### Ram
A melee cast attack category that may appear on an **Innate Attack** or a **Skill**. The current core rules assign no shared behavior to **Ram** beyond that classification.

### Self
A **Range Category** that targets only the source of the attack or **Effect**. If an ability is labeled **Self**, it cannot target any other object or unit unless that text explicitly says otherwise.

### Sky Strike
A ranged cast attack category that may appear on an **Innate Attack** or a **Skill**. The current core rules assign no shared behavior to **Sky Strike** beyond that classification.

### Sling
A ranged cast attack category that may appear on an **Innate Attack** or a **Skill**. The current core rules assign no shared behavior to **Sling** beyond that classification.

### Surroundings
A reserved keyword intended to refer to the area around a source or target. The current core rules do not define a shared procedure for **Surroundings**, so its behavior exists only if a future rule or card text defines it.

### Teleport
A reserved keyword intended for instant repositioning. The current core rules do not define a shared procedure for **Teleport**, so its behavior exists only if a future rule or card text defines it.

### Touch
A melee cast universal category that may appear on an **Innate Attack** or a **Skill**. The current core rules assign no shared behavior to **Touch** beyond that classification.
