BOARD_SIZE = 4
SYMBOLS = "XO"

WINDOWS = (
    0b1110_0000_0000_0000,
    0b0111_0000_0000_0000,
    0b0000_1110_0000_0000,
    0b0000_0111_0000_0000,
    0b0000_0000_1110_0000,
    0b0000_0000_0111_0000,
    0b0000_0000_0000_1110,
    0b0000_0000_0000_0111,

    0b1000_1000_1000_0000,
    0b0100_0100_0100_0000,
    0b0010_0010_0010_0000,
    0b0001_0001_0001_0000,
    0b0000_1000_1000_1000,
    0b0000_0100_0100_0100,
    0b0000_0010_0010_0010,
    0b0000_0001_0001_0001,

    0b1000_0100_0010_0000,
    0b0100_0010_0001_0000,
    0b0000_1000_0100_0010,
    0b0000_0100_0010_0001,

    0b0010_0100_1000_0000,
    0b0001_0010_0100_0000,
    0b0000_0010_0100_1000,
    0b0000_0001_0010_0100,
)

def is_on_board(row, col):
    return 0 <= row < BOARD_SIZE and 0 <= col < BOARD_SIZE

def bit(row, col):
    return 1 << (BOARD_SIZE * BOARD_SIZE - 1 - (row * BOARD_SIZE + col))

def has_three(stones):
    return any(stones & w == w for w in WINDOWS)

def can_still_make_three(x, o):
    return any(x & w == 0 or o & w == 0 for w in WINDOWS)

def print_board(players):
    print("\n   " + " ".join(str(col + 1) for col in range(BOARD_SIZE)))
    for row in range(BOARD_SIZE):
        cells = []
        for col in range(BOARD_SIZE):
            b = bit(row, col)
            if players[0] & b:
                cells.append("X")
            elif players[1] & b:
                cells.append("O")
            else:
                cells.append(" ")
        print(f"{row + 1}  " + " ".join(cells))
    print()

def main():
    players = [0, 0]
    turn = 0

    print("Wer drei in einer Reihe bildet (waagerecht, senkrecht, diagonal), verliert!")

    while True:
        print_board(players)
        try:
            row_input, col_input = input(f"{SYMBOLS[turn]}: Zeile Spalte > ").split()
            row = int(row_input) - 1
            col = int(col_input) - 1
        except ValueError:
            print("Bitte z.B. '2 3' eingeben.")
            continue
        except EOFError:
            return

        if not is_on_board(row, col) or (players[0] | players[1]) & bit(row, col):
            print("Ungültiger Zug.")
            continue

        players[turn] |= bit(row, col)

        if has_three(players[turn]):
            print_board(players)
            print(f"{SYMBOLS[turn]} hat drei in einer Reihe und verliert!")
            return

        if not can_still_make_three(players[0], players[1]):
            print_board(players)
            print("Unentschieden: keine Dreierreihe mehr möglich.")
            return

        turn = 1 - turn

if __name__ == "__main__":
    main()