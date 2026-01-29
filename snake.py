import pygame
import random

pygame.init()

# Classic Snake Color Palette
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
DARK_GREEN = (0, 100, 0)
GREEN = (0, 200, 0)
BRIGHT_GREEN = (0, 255, 0)
RED = (255, 0, 0)
YELLOW = (255, 255, 0)
GRAY = (100, 100, 100)

# Screen dimensions - Added space for HUD at top
HUD_HEIGHT = 50
GAME_WIDTH = 800
GAME_HEIGHT = 600
SCREEN_WIDTH = GAME_WIDTH
SCREEN_HEIGHT = GAME_HEIGHT + HUD_HEIGHT

GRID_SIZE = 20
GRID_WIDTH = GAME_WIDTH // GRID_SIZE
GRID_HEIGHT = GAME_HEIGHT // GRID_SIZE

screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
pygame.display.set_caption("🐍 Classic Snake")

clock = pygame.time.Clock()

# Fonts
font_large = pygame.font.SysFont("Arial", 48, bold=True)
font_medium = pygame.font.SysFont("Arial", 28)
font_small = pygame.font.SysFont("Arial", 20)
font_hud = pygame.font.SysFont("Courier", 18, bold=True)


def draw_snake(snake_list):
    """Draw classic square snake"""
    for i, segment in enumerate(snake_list):
        x, y = segment
        # Adjust y for HUD offset
        display_y = y + HUD_HEIGHT

        # Head is bright green, body is darker green
        if i == len(snake_list) - 1:
            # Head
            pygame.draw.rect(screen, BRIGHT_GREEN, [x, display_y, GRID_SIZE, GRID_SIZE])
            pygame.draw.rect(
                screen, DARK_GREEN, [x, display_y, GRID_SIZE, GRID_SIZE], 2
            )
        else:
            # Body
            pygame.draw.rect(screen, GREEN, [x, display_y, GRID_SIZE, GRID_SIZE])
            pygame.draw.rect(
                screen, DARK_GREEN, [x, display_y, GRID_SIZE, GRID_SIZE], 1
            )


def draw_food(position):
    """Draw simple red square food"""
    x, y = position
    display_y = y + HUD_HEIGHT
    pygame.draw.rect(screen, RED, [x, display_y, GRID_SIZE, GRID_SIZE])
    pygame.draw.rect(screen, (200, 0, 0), [x, display_y, GRID_SIZE, GRID_SIZE], 2)


def draw_hud(score, level, speed):
    """Draw HUD at the top of the screen"""
    # HUD background
    pygame.draw.rect(screen, DARK_GREEN, [0, 0, SCREEN_WIDTH, HUD_HEIGHT])
    pygame.draw.line(
        screen, BRIGHT_GREEN, (0, HUD_HEIGHT), (SCREEN_WIDTH, HUD_HEIGHT), 2
    )

    # Score (left)
    score_text = font_hud.render(f"SCORE: {score}", True, WHITE)
    screen.blit(score_text, (20, 15))

    # Level (center)
    level_text = font_hud.render(f"LEVEL: {level}", True, YELLOW)
    level_rect = level_text.get_rect(center=(SCREEN_WIDTH // 2, 25))
    screen.blit(level_text, level_rect)

    # Speed (right)
    speed_text = font_hud.render(f"SPEED: {speed}", True, WHITE)
    speed_rect = speed_text.get_rect()
    speed_rect.right = SCREEN_WIDTH - 20
    speed_rect.top = 15
    screen.blit(speed_text, speed_rect)


def calculate_level_and_speed(score):
    """Calculate current level and speed based on score"""
    level = (score // 10) + 1  # New level every 10 points
    base_speed = 5
    speed_increase = (level - 1) * 2
    speed = min(base_speed + speed_increase, 20)  # Cap at 20 FPS
    return level, speed


def start_screen():
    """Display start screen with instructions"""
    waiting = True

    while waiting:
        screen.fill(BLACK)

        # Title
        title = font_large.render("SNAKE", True, BRIGHT_GREEN)
        title_rect = title.get_rect(center=(SCREEN_WIDTH // 2, 100))
        screen.blit(title, title_rect)

        # Instructions
        instructions = [
            "Use Arrow Keys to Move",
            "Eat Red Food to Grow",
            "Avoid Walls and Yourself",
            "",
            "Level Up Every 10 Points!",
            "Speed Increases Each Level",
            "",
            "Press SPACE to Start",
            "Press ESC or Q to Quit",
        ]

        y_pos = 200
        for line in instructions:
            if line == "":
                y_pos += 15
                continue

            color = YELLOW if "Level" in line or "Speed" in line else WHITE
            text = font_small.render(line, True, color)
            text_rect = text.get_rect(center=(SCREEN_WIDTH // 2, y_pos))
            screen.blit(text, text_rect)
            y_pos += 35

        pygame.display.update()
        clock.tick(30)

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                quit()
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_SPACE:
                    waiting = False
                if event.key in [pygame.K_q, pygame.K_ESCAPE]:
                    pygame.quit()
                    quit()


def game_over_screen(score, level):
    """Display game over screen"""
    waiting = True

    while waiting:
        screen.fill(BLACK)

        # Game Over text
        title = font_large.render("GAME OVER", True, RED)
        title_rect = title.get_rect(center=(SCREEN_WIDTH // 2, 150))
        screen.blit(title, title_rect)

        # Stats
        score_text = font_medium.render(f"Final Score: {score}", True, WHITE)
        score_rect = score_text.get_rect(center=(SCREEN_WIDTH // 2, 250))
        screen.blit(score_text, score_rect)

        level_text = font_medium.render(f"Level Reached: {level}", True, YELLOW)
        level_rect = level_text.get_rect(center=(SCREEN_WIDTH // 2, 300))
        screen.blit(level_text, level_rect)

        # Options
        play_text = font_small.render("Press C to Play Again", True, GREEN)
        play_rect = play_text.get_rect(center=(SCREEN_WIDTH // 2, 400))
        screen.blit(play_text, play_rect)

        quit_text = font_small.render("Press Q or ESC to Quit", True, GRAY)
        quit_rect = quit_text.get_rect(center=(SCREEN_WIDTH // 2, 440))
        screen.blit(quit_text, quit_rect)

        pygame.display.update()
        clock.tick(30)

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                quit()
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_c:
                    waiting = False
                    return True  # Play again
                if event.key in [pygame.K_q, pygame.K_ESCAPE]:
                    pygame.quit()
                    quit()

    return False


def game_loop():
    """Main game loop"""
    game_running = True
    game_over = False

    # Snake starting position (in game coordinates, not screen coordinates)
    x = GAME_WIDTH // 2
    y = GAME_HEIGHT // 2
    x = (x // GRID_SIZE) * GRID_SIZE
    y = (y // GRID_SIZE) * GRID_SIZE

    x_change = 0
    y_change = 0

    snake_list = []
    snake_length = 1

    # Food position (in game coordinates)
    food_x = round(random.randrange(0, GAME_WIDTH - GRID_SIZE) / GRID_SIZE) * GRID_SIZE
    food_y = round(random.randrange(0, GAME_HEIGHT - GRID_SIZE) / GRID_SIZE) * GRID_SIZE

    score = 0
    level, speed = calculate_level_and_speed(score)

    while not game_over:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                game_running = False
                game_over = True
            if event.type == pygame.KEYDOWN:
                if event.key in [pygame.K_q, pygame.K_ESCAPE]:
                    game_running = False
                    game_over = True
                elif event.key == pygame.K_LEFT and x_change != GRID_SIZE:
                    x_change = -GRID_SIZE
                    y_change = 0
                elif event.key == pygame.K_RIGHT and x_change != -GRID_SIZE:
                    x_change = GRID_SIZE
                    y_change = 0
                elif event.key == pygame.K_UP and y_change != GRID_SIZE:
                    y_change = -GRID_SIZE
                    x_change = 0
                elif event.key == pygame.K_DOWN and y_change != -GRID_SIZE:
                    y_change = GRID_SIZE
                    x_change = 0

        # Update position
        x += x_change
        y += y_change

        # Check wall collision
        if x >= GAME_WIDTH or x < 0 or y >= GAME_HEIGHT or y < 0:
            game_over = True
            continue

        # Draw everything
        screen.fill(BLACK)

        # Draw HUD first
        draw_hud(score, level, speed)

        # Draw food
        draw_food((food_x, food_y))

        # Update snake
        snake_head = [x, y]
        snake_list.append(snake_head)
        if len(snake_list) > snake_length:
            del snake_list[0]

        # Check self collision
        for segment in snake_list[:-1]:
            if segment == snake_head:
                game_over = True

        # Draw snake
        draw_snake(snake_list)

        # Check food collision
        if x == food_x and y == food_y:
            food_x = (
                round(random.randrange(0, GAME_WIDTH - GRID_SIZE) / GRID_SIZE)
                * GRID_SIZE
            )
            food_y = (
                round(random.randrange(0, GAME_HEIGHT - GRID_SIZE) / GRID_SIZE)
                * GRID_SIZE
            )
            snake_length += 1
            score += 1

            # Update level and speed
            old_level = level
            level, speed = calculate_level_and_speed(score)

            # Show level up message briefly
            if level > old_level:
                # Draw current state
                pygame.display.update()

                # Show level up overlay
                overlay = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT))
                overlay.set_alpha(200)
                overlay.fill(BLACK)
                screen.blit(overlay, (0, 0))

                level_text = font_large.render(f"LEVEL {level}!", True, YELLOW)
                level_rect = level_text.get_rect(
                    center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2)
                )
                screen.blit(level_text, level_rect)

                pygame.display.update()
                pygame.time.wait(800)  # Brief pause to show level up

        pygame.display.update()
        clock.tick(speed)

    if game_running:
        return game_over_screen(score, level)
    return False


# Main game execution
start_screen()
play_again = True

while play_again:
    play_again = game_loop()

pygame.quit()
quit()
